import type { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import Need from "../model/Need.js";
import User from "../model/User.js";
import { ErrorResponse } from "../utils/errorResponse.js";

/**
 * @desc    Raise an urgent need (the optional extra form). Does NOT create a
 *          map marker — it powers the homepage "Urgent need" tab.
 * @route   POST /api/needs
 * @access  Private (Provider, Flood-Victim)
 */
export const createNeed = asyncHandler(async (req: Request, res: Response) => {
  const {
    locationName,
    district,
    revenueCircle,
    villageName,
    items,
    note,
    lat,
    lng,
  } = req.body;

  const place = typeof locationName === "string" ? locationName.trim() : "";
  const hasCoords = typeof lat === "number" && typeof lng === "number";

  // A request nobody can find is unactionable, so demand *some* location —
  // a typed place name or GPS. The administrative fields are no longer
  // required: someone stranded knows their tole, not their revenue circle.
  if (!place && !hasCoords && !district) {
    throw new ErrorResponse(
      "Add a location name or share your current location",
      400,
    );
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new ErrorResponse("Please list at least one needed item", 400);
  }

  const author = await User.findById(req.user!.id);
  if (!author) throw new ErrorResponse("User not found", 404);

  const need = await Need.create({
    ...(place ? { locationName: place } : {}),
    ...(district ? { district } : {}),
    ...(revenueCircle ? { revenueCircle } : {}),
    ...(villageName ? { villageName } : {}),
    items,
    ...(note ? { note } : {}),
    ...(typeof lat === "number" ? { lat } : {}),
    ...(typeof lng === "number" ? { lng } : {}),
    createdBy: author._id,
    providerName: author.name,
    contactPhone: author.phone,
    createdByRole: author.role,
    ...(author.organizationName ? { providerOrg: author.organizationName } : {}),
  });

  res.status(201).json({ success: true, data: need });
});

/**
 * @desc    Open urgent needs for the homepage "Urgent need" tab.
 * @route   GET /api/needs
 * @access  Public
 */
export const getUrgentNeeds = asyncHandler(
  async (_req: Request, res: Response) => {
    // Public endpoint: project away the requester's phone. These are flood
    // victims — their number goes only to signed-in responders, via
    // `getHelpRequests` below.
    const needs = await Need.find({
      isDeleted: false,
      isResolved: false,
    })
      .select("-contactPhone")
      .sort("-createdAt");
    res.status(200).json({ success: true, count: needs.length, data: needs });
  },
);

/**
 * @desc    Open help requests, including each requester's phone so a responder
 *          can call them. Deliberately separate from the public
 *          `getUrgentNeeds` rather than conditionally widening it — that way
 *          the public route can never leak a victim's number by accident.
 * @route   GET /api/needs/help-requests
 * @access  Private (Provider, Super-Admin)
 */
export const getHelpRequests = asyncHandler(
  async (_req: Request, res: Response) => {
    const needs = await Need.find({
      isDeleted: false,
      isResolved: false,
      // Only requests raised by someone asking for help — a provider logging a
      // need they observed is not a person waiting to be called.
      createdByRole: "Flood-Victim",
    }).sort("-createdAt");
    res.status(200).json({ success: true, count: needs.length, data: needs });
  },
);

/**
 * @desc    Mark a need as resolved (owner or Super-Admin).
 * @route   PATCH /api/needs/:id/resolve
 * @access  Private
 */
export const resolveNeed = asyncHandler(async (req: Request, res: Response) => {
  const need = await Need.findById(req.params.id);
  if (!need || need.isDeleted) throw new ErrorResponse("Need not found", 404);

  if (
    req.user!.role !== "Super-Admin" &&
    String(need.createdBy) !== req.user!.id
  ) {
    throw new ErrorResponse("Not authorized to resolve this need", 403);
  }

  need.isResolved = true;
  await need.save();

  res.status(200).json({ success: true, data: need });
});

/**
 * @desc    Soft-delete a need (owner or Super-Admin).
 * @route   DELETE /api/needs/:id
 * @access  Private
 */
export const deleteNeed = asyncHandler(async (req: Request, res: Response) => {
  const need = await Need.findById(req.params.id);
  if (!need || need.isDeleted) throw new ErrorResponse("Need not found", 404);

  if (
    req.user!.role !== "Super-Admin" &&
    String(need.createdBy) !== req.user!.id
  ) {
    throw new ErrorResponse("Not authorized to delete this need", 403);
  }

  need.isDeleted = true;
  await need.save();

  res.status(200).json({ success: true, message: "Need deleted" });
});
