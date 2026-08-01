import type { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import Visitor from "../model/Visitor.js";

const GLOBAL_KEY = "global";

/**
 * @desc    Get the running total of site visits.
 * @route   GET /api/visitors
 * @access  Public
 */
export const getVisitorCount = asyncHandler(
  async (_req: Request, res: Response) => {
    const doc = await Visitor.findOne({ key: GLOBAL_KEY });
    res.status(200).json({ success: true, data: { count: doc?.count ?? 0 } });
  },
);

/**
 * @desc    Record a visit — atomically increment the global counter.
 * @route   POST /api/visitors/hit
 * @access  Public
 */
export const hitVisitor = asyncHandler(
  async (_req: Request, res: Response) => {
    const doc = await Visitor.findOneAndUpdate(
      { key: GLOBAL_KEY },
      { $inc: { count: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    res.status(200).json({ success: true, data: { count: doc.count } });
  },
);
