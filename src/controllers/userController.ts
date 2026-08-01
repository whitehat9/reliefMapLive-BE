import type { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import User from "../model/User.js";
import { ErrorResponse } from "../utils/errorResponse.js";

/**
 * @desc    List users, optionally filtered by role (?role=Provider).
 * @route   GET /api/users
 * @access  Private (Super-Admin)
 */
export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = {};
  if (req.query.role) filter.role = req.query.role;

  const users = await User.find(filter).sort("-createdAt");
  res.status(200).json({ success: true, count: users.length, data: users });
});

/**
 * @desc    Get a single user.
 * @route   GET /api/users/:id
 * @access  Private (Super-Admin)
 */
export const getUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ErrorResponse("User not found", 404);
  res.status(200).json({ success: true, data: user });
});

/**
 * @desc    Enable or disable a user (e.g. suspend a provider).
 * @route   PATCH /api/users/:id/status
 * @access  Private (Super-Admin)
 */
export const setUserStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const { isDisabled } = req.body;
    if (typeof isDisabled !== "boolean") {
      throw new ErrorResponse("isDisabled (boolean) is required", 400);
    }
    if (req.params.id === req.user!.id) {
      throw new ErrorResponse("You cannot change your own status", 400);
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isDisabled },
      { new: true },
    );
    if (!user) throw new ErrorResponse("User not found", 404);
    res.status(200).json({ success: true, data: user });
  },
);

/**
 * @desc    Delete a user.
 * @route   DELETE /api/users/:id
 * @access  Private (Super-Admin)
 */
export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  if (req.params.id === req.user!.id) {
    throw new ErrorResponse("You cannot delete your own account", 400);
  }
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) throw new ErrorResponse("User not found", 404);
  res.status(200).json({ success: true, message: "User deleted" });
});
