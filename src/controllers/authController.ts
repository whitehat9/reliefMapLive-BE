import type { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import User, { type IUser } from "../model/User.js";
import { ErrorResponse } from "../utils/errorResponse.js";
import { verifyFirebaseIdToken } from "../config/firebaseAdmin.js";
import { fromFirebasePhoneNumber } from "../utils/phone.js";

/** Serialize a user for API responses (never leak firebaseUid). */
const publicUser = (user: IUser) => ({
  id: String(user._id),
  name: user.name,
  phone: user.phone,
  role: user.role,
  organizationName: user.organizationName,
  address: user.address,
  isDisabled: user.isDisabled,
});

/**
 * Verify a Firebase phone-auth ID token and return the caller's verified
 * phone number (bare 10-digit) and Firebase uid. Throws 400/401 on failure.
 */
const verifyPhoneToken = async (
  idToken: unknown,
): Promise<{ phone: string; uid: string }> => {
  if (!idToken || typeof idToken !== "string") {
    throw new ErrorResponse("Please provide a verification token", 400);
  }
  const decoded = await verifyFirebaseIdToken(idToken);
  if (!decoded.phone_number) {
    throw new ErrorResponse(
      "This verification token is not associated with a phone number",
      400,
    );
  }
  return {
    phone: fromFirebasePhoneNumber(decoded.phone_number),
    uid: decoded.uid,
  };
};

/**
 * Issue a session: a single long-lived JWT (see JWT_ACCESS_EXPIRES, 30d) in the
 * response body. There is no refresh token or cookie — the client persists this
 * token and sends it as `Authorization: Bearer`. Access is still revocable
 * server-side: `protect` reloads the user and rejects `isDisabled` on every
 * request, so disabling an account cuts off its token immediately.
 */
const issueSession = (user: IUser, statusCode: number, res: Response) => {
  const token = user.getSignedJwtToken();
  res
    .status(statusCode)
    .json({ success: true, token, user: publicUser(user) });
};

/**
 * @desc    Public provider self-registration. Verifies the caller already
 *          completed Firebase phone-OTP verification client-side, then
 *          creates a Provider (role is always forced, never taken from the
 *          body) and logs them straight in — no separate verification wait.
 * @route   POST /api/auth/signup
 * @access  Public
 */
export const signup = asyncHandler(async (req: Request, res: Response) => {
  const { idToken, name } = req.body;

  if (!name) {
    throw new ErrorResponse("Please provide a name", 400);
  }

  const { phone, uid } = await verifyPhoneToken(idToken);

  const existing = await User.findOne({ phone });
  if (existing) {
    throw new ErrorResponse(
      "An account with this phone number already exists — please sign in instead.",
      409,
    );
  }

  const user = await User.create({
    name,
    phone,
    role: "Provider", // forced — self-signup can never create a Super-Admin
    firebaseUid: uid,
  });

  issueSession(user, 201, res);
});

/**
 * @desc    Log in (any role). Verifies the caller already completed
 *          Firebase phone-OTP verification client-side.
 * @route   POST /api/auth/login
 * @access  Public
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { idToken } = req.body;
  const { phone, uid } = await verifyPhoneToken(idToken);

  const user = await User.findOne({ phone });
  if (!user) {
    // Structured signal (not a string the client has to pattern-match) so the
    // client can offer inline signup using the idToken it already has.
    res.status(404).json({
      success: false,
      code: "NO_ACCOUNT",
      message: "No account found for this phone number.",
    });
    return;
  }
  if (user.isDisabled) {
    throw new ErrorResponse("Your account has been disabled", 403);
  }

  if (!user.firebaseUid) {
    // First-touch binding: covers both the freshly-seeded Super-Admin (no
    // firebaseUid until their first real login) and every pre-existing
    // Provider migrated from the old email/password system (they already
    // have `phone` populated — this login just binds their Firebase uid,
    // no re-signup required).
    user.firebaseUid = uid;
  } else if (user.firebaseUid !== uid) {
    // Should never happen — a phone number maps to one Firebase uid per
    // project. Treat a mismatch as tamper/bug detection, not a real path.
    throw new ErrorResponse("Invalid credentials", 401);
  }

  // firebaseUid may have just been bound on first login — persist it.
  await user.save();

  issueSession(user, 200, res);
});

/**
 * @desc    Get the currently authenticated user
 * @route   GET /api/auth/me
 * @access  Private
 */
export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id);
  if (!user) {
    throw new ErrorResponse("User not found", 404);
  }
  res.status(200).json({ success: true, user: publicUser(user) });
});

/**
 * @desc    Log out. With no server-side session state (the JWT is stateless and
 *          held only by the client), this is a no-op the client calls before
 *          discarding its token — kept for API compatibility.
 * @route   POST /api/auth/logout
 * @access  Public
 */
export const logout = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ success: true, message: "Logged out" });
});
