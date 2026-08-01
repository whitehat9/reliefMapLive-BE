import type { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import Need from "../model/Need.js";
import User from "../model/User.js";
import { ErrorResponse } from "../utils/errorResponse.js";

/**
 * @desc    Raise an urgent need (the optional extra form). Does NOT create a
 *          map marker — it powers the homepage "Urgent need" tab.
 * @route   POST /api/needs
 * @access  Private (Provider)
 */
export const createNeed = asyncHandler(async (req: Request, res: Response) => {
  const { district, revenueCircle, villageName, items, note, lat, lng } =
    req.body;

  if (!district) throw new ErrorResponse("District is required", 400);
  if (!Array.isArray(items) || items.length === 0) {
    throw new ErrorResponse("Please list at least one needed item", 400);
  }

  const provider = await User.findById(req.user!.id);
  if (!provider) throw new ErrorResponse("Provider not found", 404);

  const need = await Need.create({
    district,
    ...(revenueCircle ? { revenueCircle } : {}),
    ...(villageName ? { villageName } : {}),
    items,
    ...(note ? { note } : {}),
    ...(typeof lat === "number" ? { lat } : {}),
    ...(typeof lng === "number" ? { lng } : {}),
    createdBy: provider._id,
    providerName: provider.name,
    ...(provider.organizationName
      ? { providerOrg: provider.organizationName }
      : {}),
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
    const needs = await Need.find({
      isDeleted: false,
      isResolved: false,
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
