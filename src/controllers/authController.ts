import type { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import User, { type IUser, type UserRole } from "../model/User.js";
import { ErrorResponse } from "../utils/errorResponse.js";
import { verifyFirebaseIdToken } from "../config/firebaseAdmin.js";
import {
  fromFirebasePhoneNumber,
  normalizePhoneInput,
} from "../utils/phone.js";

/** Serialize a user for API responses (never leak firebaseUid). */
const publicUser = (user: IUser) => ({
  id: String(user._id),
  name: user.name,
  phone: user.phone,
  role: user.role,
  organizationName: user.organizationName,
  address: user.address,
  isDisabled: user.isDisabled,
  isPhoneVerified: user.isPhoneVerified,
  isFloodVictim: user.isFloodVictim,
});

/**
 * Verify a Firebase phone-auth ID token and return the caller's verified
 * phone number (E.164) and Firebase uid. Throws 400/401 on failure.
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
 * @desc    Public self-registration. Two independent axes:
 *
 *          WHO  — `isFloodVictim: true` asks for the `Flood-Victim` role
 *                 (someone requesting relief); omitted means `Provider`
 *                 (someone delivering it).
 *          HOW  — an `idToken` means Firebase phone-OTP was completed
 *                 client-side and the verified number becomes their phone.
 *                 Without one, a victim may send a bare `phone` instead: the
 *                 offline bypass. Someone cut off in a flood often cannot
 *                 receive an SMS (no signal, dead handset, borrowed number),
 *                 so demanding a code would lock out exactly the people the
 *                 app exists for. That number is UNVERIFIED, hence
 *                 `isPhoneVerified:false` — `login` promotes them the first
 *                 time they do sign in with a real code.
 *
 *          The bypass is victim-only; a Provider must always prove their
 *          number. `role` is computed from a boolean and is NEVER read from
 *          the body, so no request can mint a Super-Admin.
 * @route   POST /api/auth/signup
 * @access  Public
 */
export const signup = asyncHandler(async (req: Request, res: Response) => {
  const { idToken, name, isFloodVictim } = req.body;

  if (!name) {
    throw new ErrorResponse("Please provide a name", 400);
  }

  const wantsVictim = isFloodVictim === true;
  const hasToken = typeof idToken === "string" && idToken.length > 0;

  let phone: string;
  let uid: string | undefined;

  if (hasToken) {
    ({ phone, uid } = await verifyPhoneToken(idToken));
  } else if (wantsVictim) {
    // Offline bypass — victims only, and only when no token was supplied.
    phone = normalizePhoneInput(req.body.phone, req.body.countryCode);
  } else {
    throw new ErrorResponse("Please provide a verification token", 400);
  }

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
    // Derived from a boolean, never from a caller-supplied string: the only
    // two reachable values are the public roles. Super-Admin stays seed-only.
    role: wantsVictim ? "Flood-Victim" : "Provider",
    isFloodVictim: wantsVictim, // legacy flag, kept in sync with the role
    isPhoneVerified: Boolean(uid), // true only if a real OTP actually happened
    ...(uid ? { firebaseUid: uid } : {}),
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

  // A successful OTP login proves the number — this is also how a flood-victim
  // account that skipped OTP at signup becomes verified.
  user.isPhoneVerified = true;

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

/**
 * @desc    Developer sign-in bypass. Skips Firebase entirely and mints a
 *          session for any phone number, creating the user if needed, so a
 *          dev can get into a Provider or Super-Admin account without burning
 *          real SMS quota.
 *
 *          Two independent locks, both required:
 *            1. The route is only registered when NODE_ENV === "development"
 *               (see routes/auth.ts) — it does not exist in production.
 *            2. The request must originate from loopback (this guard) — so
 *               even a dev server exposed on the LAN can't be bypassed from
 *               another machine.
 * @route   POST /api/auth/dev-login
 * @access  Development only, localhost only
 */
export const devLogin = asyncHandler(async (req: Request, res: Response) => {
  if (process.env.NODE_ENV !== "development") {
    throw new ErrorResponse("Not found", 404);
  }

  const remote = req.socket.remoteAddress ?? "";
  const isLoopback =
    remote === "::1" ||
    remote === "127.0.0.1" ||
    remote === "::ffff:127.0.0.1" ||
    remote.startsWith("127.");
  if (!isLoopback) {
    throw new ErrorResponse("Dev login is only available on localhost", 403);
  }

  const rawPhone =
    typeof req.body.phone === "string" && req.body.phone.trim()
      ? req.body.phone.trim()
      : (process.env.SUPER_ADMIN_PHONE ?? "");
  const phone = normalizePhoneInput(rawPhone, req.body.countryCode);

  // Explicit allowlist rather than a cast — an unknown role falls back to the
  // least-privileged option instead of being trusted.
  const role: UserRole =
    req.body.role === "Super-Admin"
      ? "Super-Admin"
      : req.body.role === "Flood-Victim"
        ? "Flood-Victim"
        : "Provider";

  let user = await User.findOne({ phone });
  if (!user) {
    user = await User.create({
      name:
        typeof req.body.name === "string" && req.body.name.trim()
          ? req.body.name.trim()
          : `Dev ${role}`,
      phone,
      role,
      isFloodVictim: role === "Flood-Victim",
      isPhoneVerified: true,
    });
  } else if (user.isDisabled) {
    throw new ErrorResponse("Your account has been disabled", 403);
  }

  issueSession(user, 200, res);
});
