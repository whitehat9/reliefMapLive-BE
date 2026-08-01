import type { CookieOptions, Request, Response } from "express";
import type { JwtPayload } from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import User, { type IUser } from "../model/User.js";
import { ErrorResponse } from "../utils/errorResponse.js";
import { generateRefreshToken, verifyRefreshToken } from "../utils/jwt.js";
import { verifyFirebaseIdToken } from "../config/firebaseAdmin.js";
import { fromFirebasePhoneNumber } from "../utils/phone.js";

const REFRESH_COOKIE = "jwt";
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7d, matches JWT_REFRESH_EXPIRES

/**
 * Cookie flags for the refresh token. `sameSite:"lax"` in dev so the
 * localhost:5173 → localhost:8080 fetch still carries the cookie; `"none"`
 * + secure in production where client and API may live on different domains.
 */
const refreshCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
});

/** Serialize a user for API responses (never leak refresh tokens/firebaseUid). */
const publicUser = (user: IUser) => ({
  id: String(user._id),
  name: user.name,
  phone: user.phone,
  role: user.role,
  organizationName: user.organizationName,
  address: user.address,
  isDisabled: user.isDisabled,
});

const setRefreshCookie = (res: Response, refreshToken: string) => {
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...refreshCookieOptions(),
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  });
};

const clearRefreshCookie = (res: Response) => {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
};

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
 * Issue a fresh session: a short-lived access token in the body and a rotated
 * refresh token in an httpOnly cookie. Persists the refresh token in the user's
 * array so multiple devices can each hold an independent session.
 *
 * On login the browser may still carry an old refresh cookie — we drop it from
 * the array (rotation) and, if it belongs to no one, treat it as reuse and wipe
 * every session for this user before granting the new one.
 */
const issueSession = async (
  user: IUser,
  statusCode: number,
  req: Request,
  res: Response,
) => {
  const accessToken = user.getSignedJwtToken();
  const newRefreshToken = generateRefreshToken({ id: user._id });

  const incoming = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  let retained = user.refreshTokens;

  if (incoming) {
    retained = user.refreshTokens.filter((rt) => rt !== incoming);

    // Reuse detection at login: the cookie is present but no user holds it,
    // so it was already rotated away — invalidate all existing sessions.
    const stillValid = await User.findOne({ refreshTokens: incoming });
    if (!stillValid) {
      retained = [];
    }
    clearRefreshCookie(res);
  }

  user.refreshTokens = [...retained, newRefreshToken];
  await user.save();

  setRefreshCookie(res, newRefreshToken);
  res
    .status(statusCode)
    .json({ success: true, token: accessToken, user: publicUser(user) });
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

  await issueSession(user, 201, req, res);
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

  await issueSession(user, 200, req, res);
});

/**
 * @desc    Exchange a valid refresh-token cookie for a new access token,
 *          rotating the refresh token in the process. Detects reuse of an
 *          already-rotated token and invalidates every session for that user.
 * @route   GET /api/auth/refresh
 * @access  Public (the access token may be expired)
 */
export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!token) {
    throw new ErrorResponse("Not authorized, no refresh token", 401);
  }

  // The presented token is spent regardless of outcome — always clear it.
  clearRefreshCookie(res);

  const foundUser = await User.findOne({ refreshTokens: token });

  // Reuse detection: a well-formed token that no user still holds was already
  // rotated away (or stolen). Nuke every session for whoever it points at.
  if (!foundUser) {
    let decoded: JwtPayload;
    try {
      decoded = verifyRefreshToken(token);
    } catch {
      throw new ErrorResponse("Forbidden", 403);
    }
    const compromised = await User.findById(decoded.id);
    if (compromised) {
      compromised.refreshTokens = [];
      await compromised.save();
    }
    throw new ErrorResponse("Forbidden", 403);
  }

  // Retire the presented token from this user's device list.
  const retained = foundUser.refreshTokens.filter((rt) => rt !== token);

  let decoded: JwtPayload;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    // Legitimately ours but expired/invalid — just drop it, no rotation.
    foundUser.refreshTokens = retained;
    await foundUser.save();
    throw new ErrorResponse("Forbidden", 403);
  }

  if (decoded.id !== String(foundUser._id)) {
    throw new ErrorResponse("Forbidden", 403);
  }
  if (foundUser.isDisabled) {
    throw new ErrorResponse("Your account has been disabled", 403);
  }

  // Rotate: mint a new refresh token, leaving every other device untouched.
  const newRefreshToken = generateRefreshToken({ id: foundUser._id });
  foundUser.refreshTokens = [...retained, newRefreshToken];
  await foundUser.save();

  setRefreshCookie(res, newRefreshToken);
  res.status(200).json({
    success: true,
    token: foundUser.getSignedJwtToken(),
    user: publicUser(foundUser),
  });
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
 * @desc    Log out this device — remove its refresh token and clear the cookie.
 *          Authenticated by the refresh cookie, so it works even once the
 *          access token has expired.
 * @route   POST /api/auth/logout
 * @access  Public
 */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;

  if (!token) {
    res.sendStatus(204);
    return;
  }

  const foundUser = await User.findOne({ refreshTokens: token });
  if (foundUser) {
    foundUser.refreshTokens = foundUser.refreshTokens.filter(
      (rt) => rt !== token,
    );
    await foundUser.save();
  }

  clearRefreshCookie(res);
  res.status(200).json({ success: true, message: "Logged out" });
});
