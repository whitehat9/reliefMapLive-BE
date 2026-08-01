import type { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import District from "../model/District.js";
import RevenueCircle from "../model/RevenueCircle.js";
import Village from "../model/Village.js";
import { ErrorResponse } from "../utils/errorResponse.js";

type Bounds = { north: number; south: number; east: number; west: number };

/** Validate an incoming rectangle; normalizes corner ordering. Null if absent/invalid. */
const parseBounds = (raw: unknown): Bounds | null => {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const { north, south, east, west } = b;
  if (
    typeof north !== "number" ||
    typeof south !== "number" ||
    typeof east !== "number" ||
    typeof west !== "number"
  ) {
    return null;
  }
  return {
    north: Math.max(north, south),
    south: Math.min(north, south),
    east: Math.max(east, west),
    west: Math.min(east, west),
  };
};

/**
 * Resolve the location fields to persist. A drawn rectangle wins and also sets
 * lat/lng to the box center, so point consumers (e.g. the relief form's
 * address-mode coordinates) keep working. Otherwise fall back to raw lat/lng.
 */
const locationFields = (
  body: Record<string, unknown>,
): { lat?: number; lng?: number; bounds?: Bounds } => {
  const bounds = parseBounds(body.bounds);
  if (bounds) {
    return {
      bounds,
      lat: (bounds.north + bounds.south) / 2,
      lng: (bounds.east + bounds.west) / 2,
    };
  }
  const out: { lat?: number; lng?: number } = {};
  if (typeof body.lat === "number") out.lat = body.lat;
  if (typeof body.lng === "number") out.lng = body.lng;
  return out;
};

/* ------------------------------- Districts ------------------------------- */

// @route POST /api/geography/districts   (Super-Admin)
export const createDistrict = asyncHandler(
  async (req: Request, res: Response) => {
    const { name } = req.body;
    if (!name) throw new ErrorResponse("Please provide a district name", 400);

    const district = await District.create({
      name,
      ...locationFields(req.body),
    });
    res.status(201).json({ success: true, data: district });
  },
);

// @route GET /api/geography/districts   (Public)
export const getDistricts = asyncHandler(
  async (_req: Request, res: Response) => {
    const districts = await District.find({ isDeleted: false }).sort("name");
    res.status(200).json({ success: true, count: districts.length, data: districts });
  },
);

// @route PUT /api/geography/districts/:id   (Super-Admin)
export const updateDistrict = asyncHandler(
  async (req: Request, res: Response) => {
    const district = await District.findById(req.params.id);
    if (!district || district.isDeleted) {
      throw new ErrorResponse("District not found", 404);
    }
    if (req.body.name) district.name = req.body.name;
    const dLoc = locationFields(req.body);
    if (dLoc.bounds) district.bounds = dLoc.bounds;
    if (typeof dLoc.lat === "number") district.lat = dLoc.lat;
    if (typeof dLoc.lng === "number") district.lng = dLoc.lng;
    await district.save();
    res.status(200).json({ success: true, data: district });
  },
);

// @route PUT /api/geography/districts/:id/bounds   (Super-Admin | Provider)
// Draw-only update: marks an existing district as flood-affected by setting its
// rectangle (and derived center). Never touches the name — safe for Providers.
export const setDistrictBounds = asyncHandler(
  async (req: Request, res: Response) => {
    const bounds = parseBounds(req.body.bounds);
    if (!bounds) {
      throw new ErrorResponse(
        "A valid rectangle (north, south, east, west) is required",
        400,
      );
    }
    const district = await District.findById(req.params.id);
    if (!district || district.isDeleted) {
      throw new ErrorResponse("District not found", 404);
    }
    district.bounds = bounds;
    district.lat = (bounds.north + bounds.south) / 2;
    district.lng = (bounds.east + bounds.west) / 2;
    await district.save();
    res.status(200).json({ success: true, data: district });
  },
);

// @route DELETE /api/geography/districts/:id   (Super-Admin)
export const deleteDistrict = asyncHandler(
  async (req: Request, res: Response) => {
    const district = await District.findByIdAndUpdate(req.params.id, {
      isDeleted: true,
    });
    if (!district) throw new ErrorResponse("District not found", 404);
    res.status(200).json({ success: true, message: "District deleted" });
  },
);

/* ----------------------------- Revenue circles ----------------------------- */

// @route POST /api/geography/revenue-circles   (Super-Admin)
export const createRevenueCircle = asyncHandler(
  async (req: Request, res: Response) => {
    const { name, district } = req.body;
    if (!name || !district) {
      throw new ErrorResponse("Please provide a name and district", 400);
    }
    const parent = await District.findOne({ _id: district, isDeleted: false });
    if (!parent) throw new ErrorResponse("District not found", 404);

    const revenueCircle = await RevenueCircle.create({
      name,
      district,
      ...locationFields(req.body),
    });
    res.status(201).json({ success: true, data: revenueCircle });
  },
);

// @route GET /api/geography/revenue-circles?district=<id>   (Public)
export const getRevenueCircles = asyncHandler(
  async (req: Request, res: Response) => {
    const filter: Record<string, unknown> = { isDeleted: false };
    if (req.query.district) filter.district = req.query.district;

    const revenueCircles = await RevenueCircle.find(filter).sort("name");
    res
      .status(200)
      .json({ success: true, count: revenueCircles.length, data: revenueCircles });
  },
);

// @route PUT /api/geography/revenue-circles/:id   (Super-Admin)
export const updateRevenueCircle = asyncHandler(
  async (req: Request, res: Response) => {
    const revenueCircle = await RevenueCircle.findById(req.params.id);
    if (!revenueCircle || revenueCircle.isDeleted) {
      throw new ErrorResponse("Revenue circle not found", 404);
    }
    if (req.body.name) revenueCircle.name = req.body.name;
    const rcLoc = locationFields(req.body);
    if (rcLoc.bounds) revenueCircle.bounds = rcLoc.bounds;
    if (typeof rcLoc.lat === "number") revenueCircle.lat = rcLoc.lat;
    if (typeof rcLoc.lng === "number") revenueCircle.lng = rcLoc.lng;
    await revenueCircle.save();
    res.status(200).json({ success: true, data: revenueCircle });
  },
);

// @route PUT /api/geography/revenue-circles/:id/bounds   (Super-Admin | Provider)
export const setRevenueCircleBounds = asyncHandler(
  async (req: Request, res: Response) => {
    const bounds = parseBounds(req.body.bounds);
    if (!bounds) {
      throw new ErrorResponse(
        "A valid rectangle (north, south, east, west) is required",
        400,
      );
    }
    const revenueCircle = await RevenueCircle.findById(req.params.id);
    if (!revenueCircle || revenueCircle.isDeleted) {
      throw new ErrorResponse("Revenue circle not found", 404);
    }
    revenueCircle.bounds = bounds;
    revenueCircle.lat = (bounds.north + bounds.south) / 2;
    revenueCircle.lng = (bounds.east + bounds.west) / 2;
    await revenueCircle.save();
    res.status(200).json({ success: true, data: revenueCircle });
  },
);

// @route DELETE /api/geography/revenue-circles/:id   (Super-Admin)
export const deleteRevenueCircle = asyncHandler(
  async (req: Request, res: Response) => {
    const revenueCircle = await RevenueCircle.findByIdAndUpdate(req.params.id, {
      isDeleted: true,
    });
    if (!revenueCircle) throw new ErrorResponse("Revenue circle not found", 404);
    res.status(200).json({ success: true, message: "Revenue circle deleted" });
  },
);

/* -------------------------------- Villages ------------------------------- */

// @route POST /api/geography/villages   (Super-Admin)
export const createVillage = asyncHandler(
  async (req: Request, res: Response) => {
    const { name, district, revenueCircle } = req.body;
    if (!name || !district) {
      throw new ErrorResponse("Please provide a name and district", 400);
    }
    const parent = await District.findOne({ _id: district, isDeleted: false });
    if (!parent) throw new ErrorResponse("District not found", 404);

    const village = await Village.create({
      name,
      district,
      ...(revenueCircle ? { revenueCircle } : {}),
      ...locationFields(req.body),
    });
    res.status(201).json({ success: true, data: village });
  },
);

// @route GET /api/geography/villages?district=<id>&revenueCircle=<id>   (Public)
export const getVillages = asyncHandler(
  async (req: Request, res: Response) => {
    const filter: Record<string, unknown> = { isDeleted: false };
    if (req.query.district) filter.district = req.query.district;
    if (req.query.revenueCircle) filter.revenueCircle = req.query.revenueCircle;

    const villages = await Village.find(filter).sort("name");
    res
      .status(200)
      .json({ success: true, count: villages.length, data: villages });
  },
);

// @route PUT /api/geography/villages/:id   (Super-Admin)
export const updateVillage = asyncHandler(
  async (req: Request, res: Response) => {
    const village = await Village.findById(req.params.id);
    if (!village || village.isDeleted) {
      throw new ErrorResponse("Village not found", 404);
    }
    if (req.body.name) village.name = req.body.name;
    if (req.body.revenueCircle) village.revenueCircle = req.body.revenueCircle;
    const vLoc = locationFields(req.body);
    if (vLoc.bounds) village.bounds = vLoc.bounds;
    if (typeof vLoc.lat === "number") village.lat = vLoc.lat;
    if (typeof vLoc.lng === "number") village.lng = vLoc.lng;
    await village.save();
    res.status(200).json({ success: true, data: village });
  },
);

// @route PUT /api/geography/villages/:id/bounds   (Super-Admin | Provider)
export const setVillageBounds = asyncHandler(
  async (req: Request, res: Response) => {
    const bounds = parseBounds(req.body.bounds);
    if (!bounds) {
      throw new ErrorResponse(
        "A valid rectangle (north, south, east, west) is required",
        400,
      );
    }
    const village = await Village.findById(req.params.id);
    if (!village || village.isDeleted) {
      throw new ErrorResponse("Village not found", 404);
    }
    village.bounds = bounds;
    village.lat = (bounds.north + bounds.south) / 2;
    village.lng = (bounds.east + bounds.west) / 2;
    await village.save();
    res.status(200).json({ success: true, data: village });
  },
);

// @route DELETE /api/geography/villages/:id   (Super-Admin)
export const deleteVillage = asyncHandler(
  async (req: Request, res: Response) => {
    const village = await Village.findByIdAndUpdate(req.params.id, {
      isDeleted: true,
    });
    if (!village) throw new ErrorResponse("Village not found", 404);
    res.status(200).json({ success: true, message: "Village deleted" });
  },
);
