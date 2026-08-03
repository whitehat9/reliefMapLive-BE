import type { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import ZengMarker from "../model/ZengMarker.js";
import { ZENG_MARKER_TYPES, type ZengMarkerType } from "../types/index.js";
import { ErrorResponse } from "../utils/errorResponse.js";

const isZengMarkerType = (v: unknown): v is ZengMarkerType =>
  typeof v === "string" && (ZENG_MARKER_TYPES as readonly string[]).includes(v);

/**
 * @desc    Road-condition reports for the map's "Zeng layer" (boat / tractor / JCB
 *          / broken embankment).
 * @route   GET /api/zeng-markers
 * @access  Public
 */
export const getZengMarkers = asyncHandler(
  async (_req: Request, res: Response) => {
    const markers = await ZengMarker.find({ isDeleted: false }).sort(
      "-createdAt",
    );
    res
      .status(200)
      .json({ success: true, count: markers.length, data: markers });
  },
);

/**
 * @desc    Report a road condition. Anonymous — no account needed.
 * @route   POST /api/zeng-markers
 * @access  Public
 */
export const createZengMarker = asyncHandler(
  async (req: Request, res: Response) => {
    const { type, lat, lng, contactNumber } = req.body;

    if (!isZengMarkerType(type)) {
      throw new ErrorResponse("Invalid road condition type", 400);
    }
    if (typeof lat !== "number" || typeof lng !== "number") {
      throw new ErrorResponse("A map location is required", 400);
    }

    const needsContact =
      type === "boat" || type === "tractor" || type === "jcb";
    const contact =
      typeof contactNumber === "string" ? contactNumber.trim() : "";
    if (needsContact && !contact) {
      throw new ErrorResponse(
        `A ${type === "boat" ? "boat" : type === "tractor" ? "tractor" : "JCB"} driver contact number is required`,
        400,
      );
    }

    const marker = await ZengMarker.create({
      type,
      lat,
      lng,
      ...(needsContact ? { contactNumber: contact } : {}),
    });

    res.status(201).json({ success: true, data: marker });
  },
);

/**
 * @desc    Remove a road-condition report (moderation).
 * @route   DELETE /api/zeng-markers/:id
 * @access  Private (Super-Admin)
 */
export const deleteZengMarker = asyncHandler(
  async (req: Request, res: Response) => {
    const marker = await ZengMarker.findById(req.params.id);
    if (!marker || marker.isDeleted) {
      throw new ErrorResponse("Report not found", 404);
    }

    marker.isDeleted = true;
    await marker.save();

    res.status(200).json({ success: true, message: "Report deleted" });
  },
);
