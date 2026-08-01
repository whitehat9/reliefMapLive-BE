import { ErrorResponse } from "./errorResponse.js";

const E164_INDIA = /^\+91([6-9]\d{9})$/;

/**
 * Convert the E.164 phone number embedded in a verified Firebase ID token
 * (e.g. "+919812345678") into the bare 10-digit format used everywhere else
 * in this app (`PHONE_RE = /^[6-9]\d{9}$/`). India-only, matching the app's
 * existing phone validation.
 */
export const fromFirebasePhoneNumber = (e164: string): string => {
  const match = E164_INDIA.exec(e164);
  if (!match) {
    throw new ErrorResponse("Only Indian mobile numbers are supported", 400);
  }
  return match[1]!;
};
