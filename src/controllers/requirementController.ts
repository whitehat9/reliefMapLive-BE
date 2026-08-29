import type { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import Requirement, { REQUIREMENT_STATUSES } from "../model/Requirement.js";
import User from "../model/User.js";
import { ErrorResponse } from "../utils/errorResponse.js";
import { normalizePhoneInput } from "../utils/phone.js";
import { REQUIREMENT_ITEMS, type RequirementItem } from "../types/index.js";

/** Keep only recognised requirement items, de-duplicated. */
const sanitizeItems = (input: unknown): RequirementItem[] => {
  if (!Array.isArray(input)) return [];
  const allowed = new Set<string>(REQUIREMENT_ITEMS);
  return [...new Set(input.filter((i): i is RequirementItem => allowed.has(i)))];
};

/**
 * @desc    Post a requirement so other, future Providers can see what's
 *          needed where and respond.
 * @route   POST /api/requirements
 * @access  Private (Provider)
 */
export const createRequirement = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      items: rawItems,
      message,
      phoneNumber,
      countryCode,
      count,
      lat,
      lng,
    } = req.body;

    const items = sanitizeItems(rawItems);
    const trimmedMessage = message ? String(message).trim() : "";
    if (items.length === 0 && !trimmedMessage) {
      throw new ErrorResponse("Select what's needed or add a description", 400);
    }
    // Accepts a full E.164 number, or bare national digits plus `countryCode`.
    // Throws a 400 with a country-specific message when neither parses.
    const normalizedPhone = normalizePhoneInput(phoneNumber, countryCode);

    const hasCoords = typeof lat === "number" && typeof lng === "number";
    if (!hasCoords) {
      throw new ErrorResponse("Provide your location", 400);
    }

    const provider = await User.findById(req.user!.id);
    if (!provider) throw new ErrorResponse("Provider not found", 404);

    const requirement = await Requirement.create({
      items,
      ...(trimmedMessage ? { message: trimmedMessage } : {}),
      phoneNumber: normalizedPhone,
      ...(typeof count === "number" ? { count } : {}),
      ...(hasCoords ? { lat, lng } : {}),
      createdBy: provider._id,
      providerName: provider.name,
      ...(provider.organizationName ? { providerOrg: provider.organizationName } : {}),
      ...(provider.phone ? { providerContact: provider.phone } : {}),
    });

    res.status(201).json({ success: true, data: requirement });
  },
);

/**
 * @desc    The shared requirement board — every open requirement, for
 *          Providers to browse and the Super-Admin to moderate.
 * @route   GET /api/requirements
 * @access  Private (Provider, Super-Admin)
 */
export const getRequirements = asyncHandler(
  async (_req: Request, res: Response) => {
    const requirements = await Requirement.find({ isDeleted: false }).sort(
      "-createdAt",
    );
    res
      .status(200)
      .json({ success: true, count: requirements.length, data: requirements });
  },
);

/**
 * @desc    The requirements posted by the current Provider.
 * @route   GET /api/requirements/mine
 * @access  Private (Provider)
 */
export const getMyRequirements = asyncHandler(
  async (req: Request, res: Response) => {
    const requirements = await Requirement.find({
      createdBy: req.user!.id,
      isDeleted: false,
    }).sort("-createdAt");
    res
      .status(200)
      .json({ success: true, count: requirements.length, data: requirements });
  },
);

/**
 * @desc    Get a single requirement.
 * @route   GET /api/requirements/:id
 * @access  Private (owner or Super-Admin)
 */
export const getRequirement = asyncHandler(
  async (req: Request, res: Response) => {
    const requirement = await Requirement.findById(req.params.id);
    if (!requirement || requirement.isDeleted) {
      throw new ErrorResponse("Requirement not found", 404);
    }
    if (
      req.user!.role !== "Super-Admin" &&
      String(requirement.createdBy) !== req.user!.id
    ) {
      throw new ErrorResponse("Not authorized to view this requirement", 403);
    }
    res.status(200).json({ success: true, data: requirement });
  },
);

/**
 * @desc    Update a requirement's content.
 * @route   PATCH /api/requirements/:id
 * @access  Private (owner or Super-Admin)
 */
export const updateRequirement = asyncHandler(
  async (req: Request, res: Response) => {
    const requirement = await Requirement.findById(req.params.id);
    if (!requirement || requirement.isDeleted) {
      throw new ErrorResponse("Requirement not found", 404);
    }
    if (
      req.user!.role !== "Super-Admin" &&
      String(requirement.createdBy) !== req.user!.id
    ) {
      throw new ErrorResponse("Not authorized to update this requirement", 403);
    }

    const {
      items: rawItems,
      message,
      phoneNumber,
      countryCode,
      count,
      lat,
      lng,
    } = req.body;

    if (rawItems !== undefined) requirement.items = sanitizeItems(rawItems);
    if (message !== undefined) {
      requirement.message = String(message).trim();
    }
    // A requirement must still carry either an item selection or a description.
    if (requirement.items.length === 0 && !requirement.message) {
      throw new ErrorResponse("Select what's needed or add a description", 400);
    }
    if (phoneNumber !== undefined) {
      requirement.phoneNumber = normalizePhoneInput(phoneNumber, countryCode);
    }
    if (typeof count === "number") requirement.count = count;
    if (typeof lat === "number") requirement.lat = lat;
    if (typeof lng === "number") requirement.lng = lng;

    await requirement.save();
    res.status(200).json({ success: true, data: requirement });
  },
);

/**
 * @desc    Move a requirement through its coordination lifecycle:
 *          open → planning (a Provider commits to delivering) → provided (done).
 *          Any Provider may claim an open requirement ("planning"); only the
 *          claimer, the post owner, or the Super-Admin may complete or release it.
 * @route   PATCH /api/requirements/:id/status
 * @access  Private (Provider, Super-Admin)
 */
export const updateRequirementStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const { status } = req.body;
    if (!REQUIREMENT_STATUSES.includes(status)) {
      throw new ErrorResponse("Invalid status", 400);
    }

    const requirement = await Requirement.findById(req.params.id);
    if (!requirement || requirement.isDeleted) {
      throw new ErrorResponse("Requirement not found", 404);
    }

    const isAdmin = req.user!.role === "Super-Admin";
    const isOwner = String(requirement.createdBy) === req.user!.id;
    const isClaimer =
      requirement.claimedBy !== undefined &&
      String(requirement.claimedBy) === req.user!.id;

    if (status === "planning") {
      // Any Provider can commit to an unclaimed requirement.
      if (requirement.status === "planning" && !isClaimer && !isOwner && !isAdmin) {
        throw new ErrorResponse(
          "This requirement is already being handled by another provider",
          409,
        );
      }
      const provider = await User.findById(req.user!.id);
      if (!provider) throw new ErrorResponse("Provider not found", 404);
      requirement.status = "planning";
      requirement.claimedBy = provider._id;
      requirement.claimedByName = provider.name;
      if (provider.organizationName) {
        requirement.claimedByOrg = provider.organizationName;
      } else {
        requirement.claimedByOrg = undefined;
      }
    } else {
      // Completing or releasing is restricted to the claimer / owner / admin.
      if (!isClaimer && !isOwner && !isAdmin) {
        throw new ErrorResponse(
          "Not authorized to update this requirement",
          403,
        );
      }
      requirement.status = status;
      if (status === "open") {
        requirement.claimedBy = undefined;
        requirement.claimedByName = undefined;
        requirement.claimedByOrg = undefined;
      }
    }

    requirement.isResolved = requirement.status === "provided";
    await requirement.save();
    res.status(200).json({ success: true, data: requirement });
  },
);

/**
 * @desc    Soft-delete a requirement (owner, or Super-Admin removing an
 *          unwanted/spam entry).
 * @route   DELETE /api/requirements/:id
 * @access  Private (owner or Super-Admin)
 */
export const deleteRequirement = asyncHandler(
  async (req: Request, res: Response) => {
    const requirement = await Requirement.findById(req.params.id);
    if (!requirement || requirement.isDeleted) {
      throw new ErrorResponse("Requirement not found", 404);
    }
    const isAdmin = req.user!.role === "Super-Admin";
    if (!isAdmin && String(requirement.createdBy) !== req.user!.id) {
      throw new ErrorResponse("Not authorized to delete this requirement", 403);
    }
    // Don't let an owner erase coordination a provider is relying on.
    if (!isAdmin && requirement.status === "planning") {
      throw new ErrorResponse(
        "A provider is planning to fulfil this requirement — ask them to unselect it before deleting",
        409,
      );
    }

    requirement.isDeleted = true;
    await requirement.save();
    res.status(200).json({ success: true, message: "Requirement deleted" });
  },
);
