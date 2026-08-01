import type { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import Marker from "../model/Marker.js";
import User from "../model/User.js";
import { ErrorResponse } from "../utils/errorResponse.js";

const startOfToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * @desc    Submit a relief drop. Always saves a record; creates a LIVE map
 *          marker unless the provider marks it "previously delivered" (in
 *          which case it's saved already-expired — counted in stats/lists,
 *          never shown as an active pin).
 * @route   POST /api/markers
 * @access  Private (Provider)
 */
export const createRelief = asyncHandler(async (req: Request, res: Response) => {
  const {
    district,
    revenueCircle,
    villageName,
    landmark,
    lat,
    lng,
    items,
    reliefDeliveredCount,
    familiesCount,
    estimatedPeople,
    amount,
    photos,
    status,
    previouslyDelivered,
  } = req.body;

  const hasCoords = typeof lat === "number" && typeof lng === "number";
  if (!district && !hasCoords) {
    throw new ErrorResponse(
      "Provide a district, or use your current location, or pin the map",
      400,
    );
  }

  const provider = await User.findById(req.user!.id);
  if (!provider) throw new ErrorResponse("Provider not found", 404);

  const now = new Date();
  const marker = await Marker.create({
    ...(district ? { district } : {}),
    ...(revenueCircle ? { revenueCircle } : {}),
    ...(villageName ? { villageName } : {}),
    ...(landmark ? { landmark } : {}),
    ...(hasCoords ? { lat, lng } : {}),
    date: now,
    time: now.toTimeString().slice(0, 5), // automatic HH:MM
    ...(status ? { status } : {}),
    items: Array.isArray(items) ? items : [],
    reliefDeliveredCount: Number(reliefDeliveredCount) || 0,
    ...(familiesCount != null ? { familiesCount } : {}),
    ...(estimatedPeople != null ? { estimatedPeople } : {}),
    ...(typeof amount === "number" ? { amount } : {}),
    photos: Array.isArray(photos) ? photos : [],
    createdBy: provider._id,
    providerName: provider.name,
    providerOrg: provider.organizationName ?? provider.name,
    providerContact: provider.phone ?? "",
    isPreviouslyDelivered: Boolean(previouslyDelivered),
    // A "previously delivered" record is saved already-expired, so it never
    // shows as an active/pulsing pin — it still counts toward stats/lists.
    ...(previouslyDelivered ? { expiresAt: new Date(now.getTime() - 1000) } : {}),
  });

  res.status(201).json({
    success: true,
    markerCreated: !previouslyDelivered,
    data: marker,
  });
});

/**
 * @desc    Active markers for the map (not deleted, not yet expired).
 * @route   GET /api/markers
 * @access  Public
 */
export const getActiveMarkers = asyncHandler(
  async (_req: Request, res: Response) => {
    const markers = await Marker.find({
      isDeleted: false,
      expiresAt: { $gt: new Date() },
    }).sort("-createdAt");
    res
      .status(200)
      .json({ success: true, count: markers.length, data: markers });
  },
);

/**
 * @desc    Past relief — markers whose 24h active window has expired.
 * @route   GET /api/markers/past
 * @access  Public
 */
export const getPastMarkers = asyncHandler(
  async (_req: Request, res: Response) => {
    const markers = await Marker.find({
      isDeleted: false,
      expiresAt: { $lte: new Date() },
    })
      .sort("-expiresAt")
      .limit(200);
    res
      .status(200)
      .json({ success: true, count: markers.length, data: markers });
  },
);

/**
 * @desc    Markers created by the logged-in provider.
 * @route   GET /api/markers/mine
 * @access  Private (Provider)
 */
export const getMyMarkers = asyncHandler(
  async (req: Request, res: Response) => {
    const markers = await Marker.find({
      createdBy: req.user!.id,
      isDeleted: false,
    }).sort("-createdAt");
    res
      .status(200)
      .json({ success: true, count: markers.length, data: markers });
  },
);

/**
 * @desc    Homepage "Live Snapshot" — total relief delivered today, plus the
 *          current active-marker breakdown by status.
 * @route   GET /api/markers/stats/today
 * @access  Public
 */
export const getTodayStats = asyncHandler(
  async (_req: Request, res: Response) => {
    const since = startOfToday();

    const [agg] = await Marker.aggregate<{
      totalDelivered: number;
      markerCount: number;
    }>([
      { $match: { isDeleted: false, createdAt: { $gte: since } } },
      {
        $group: {
          _id: null,
          totalDelivered: { $sum: "$reliefDeliveredCount" },
          markerCount: { $sum: 1 },
        },
      },
    ]);

    const activeFilter = { isDeleted: false, expiresAt: { $gt: new Date() } };
    const activeCount = await Marker.countDocuments(activeFilter);
    const needed = await Marker.countDocuments({ ...activeFilter, status: "needed" });
    const providing = await Marker.countDocuments({ ...activeFilter, status: "providing" });
    const provided = await Marker.countDocuments({ ...activeFilter, status: "provided" });
    const providers = (await Marker.distinct("createdBy", { isDeleted: false })).length;
    const previouslyDeliveredCount = await Marker.countDocuments({
      isDeleted: false,
      createdAt: { $gte: since },
      isPreviouslyDelivered: true,
    });

    res.status(200).json({
      success: true,
      data: {
        totalReliefDeliveredToday: agg?.totalDelivered ?? 0,
        markersToday: agg?.markerCount ?? 0,
        activeMarkers: activeCount,
        needed,
        providing,
        provided,
        providers,
        previouslyDeliveredCount,
      },
    });
  },
);

/**
 * @desc    Update a marker (owner or Super-Admin).
 * @route   PUT /api/markers/:id
 * @access  Private
 */
export const updateMarker = asyncHandler(async (req: Request, res: Response) => {
  const marker = await Marker.findById(req.params.id);
  if (!marker || marker.isDeleted) throw new ErrorResponse("Marker not found", 404);

  if (
    req.user!.role !== "Super-Admin" &&
    String(marker.createdBy) !== req.user!.id
  ) {
    throw new ErrorResponse("Not authorized to update this marker", 403);
  }

  const editable = [
    "villageName",
    "landmark",
    "lat",
    "lng",
    "items",
    "reliefDeliveredCount",
    "familiesCount",
    "estimatedPeople",
    "amount",
    "status",
    "photos",
  ] as const;

  for (const key of editable) {
    if (req.body[key] !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (marker as any)[key] = req.body[key];
    }
  }
  await marker.save();

  res.status(200).json({ success: true, data: marker });
});

/**
 * @desc    Soft-delete a marker (owner or Super-Admin).
 * @route   DELETE /api/markers/:id
 * @access  Private
 */
export const deleteMarker = asyncHandler(async (req: Request, res: Response) => {
  const marker = await Marker.findById(req.params.id);
  if (!marker || marker.isDeleted) {
    throw new ErrorResponse("Marker not found", 404);
  }

  if (
    req.user!.role !== "Super-Admin" &&
    String(marker.createdBy) !== req.user!.id
  ) {
    throw new ErrorResponse("Not authorized to delete this marker", 403);
  }

  marker.isDeleted = true;
  await marker.save();

  res.status(200).json({ success: true, message: "Marker deleted" });
});
