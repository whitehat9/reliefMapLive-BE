import type { Request, Response, NextFunction } from "express";
import asyncHandler from "express-async-handler";
import { verifyToken } from "../utils/jwt.js";
import { ErrorResponse } from "../utils/errorResponse.js";
import User, { type UserRole } from "../model/User.js";

/**
 * Verify the JWT from the `Authorization: Bearer` header, confirm the user
 * still exists and is enabled, and attach `req.user`.
 */
export const protect = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }

    if (!token) {
      throw new ErrorResponse("Not authorized, no token provided", 401);
    }

    // A malformed/expired token must surface as 401 (not the raw jwt throw,
    // which the error handler would turn into a 500) so the client can clear
    // its stale session and route the user back to login.
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch {
      throw new ErrorResponse("Not authorized, token failed", 401);
    }
    const user = await User.findById(decoded.id);

    if (!user) {
      throw new ErrorResponse("Not authorized, user no longer exists", 401);
    }
    if (user.isDisabled) {
      throw new ErrorResponse("Your account has been disabled", 403);
    }

    req.user = { id: String(user._id), role: user.role };
    next();
  },
);

/**
 * Restrict a route to one or more roles. Must run after `protect`.
 */
export const authorize =
  (...roles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new ErrorResponse(
        "Forbidden: you do not have permission to perform this action",
        403,
      );
    }
    next();
  };
