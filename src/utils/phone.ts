import { ErrorResponse } from "./errorResponse.js";

/**
 * Phone handling for the whole app.
 *
 * Numbers are stored in **E.164** (`+9779812345678`), not as bare national
 * digits. That matters because `User.phone` is the unique account key and the
 * app serves two countries whose mobile ranges overlap: a Nepali `98…` number
 * and an Indian `98…` number are the same ten digits but different people.
 * Storing the country code is what keeps them from colliding on one account.
 */

/** A dialling country this deployment accepts, with its national-number rule. */
export interface PhoneCountry {
  /** E.164 dialling prefix, including the leading "+". */
  readonly code: string;
  readonly label: string;
  /** Matches the national part only (no country code). */
  readonly national: RegExp;
  readonly hint: string;
}

/**
 * Any 10-digit national number is accepted under either dialling code.
 *
 * The per-country opening-digit rules (Nepal `96/97/98`, India `6–9`) were
 * deliberately dropped: they rejected legitimate numbers — landlines, new
 * ranges, test numbers — and a relief app turning someone away at signup is
 * worse than storing a number that never receives SMS. Firebase still proves
 * the number is real on the OTP path; this check only guards the shape.
 *
 * Nepal first — it is the deployment's primary country.
 */
export const SUPPORTED_COUNTRIES: readonly PhoneCountry[] = [
  {
    code: "+977",
    label: "Nepal",
    national: /^\d{10}$/,
    hint: "10 digits",
  },
  {
    code: "+91",
    label: "India",
    // Kept because the app was first deployed in Assam and those accounts
    // still sign in.
    national: /^\d{10}$/,
    hint: "10 digits",
  },
];

export const DEFAULT_COUNTRY_CODE = "+977";

/** Longest national number across supported countries — input maxlength. */
export const PHONE_MAX_LENGTH = 10;

export const findCountry = (code: string): PhoneCountry | undefined =>
  SUPPORTED_COUNTRIES.find((c) => c.code === code);

/**
 * Permissive shape check for anything already in E.164 form. Used by the
 * Mongoose schema, which must accept every row it will ever `save()` —
 * including legacy rows and any country added later. Strict per-country
 * validation happens at the API boundary via `parseE164`, not here.
 */
export const E164_LOOSE = /^\+[1-9]\d{9,14}$/;

/** Join a country code and a national number into E.164, validating both. */
export const toE164 = (countryCode: string, national: string): string => {
  const country = findCountry(countryCode);
  if (!country) {
    throw new ErrorResponse("Unsupported country code", 400);
  }
  const digits = national.replace(/\D/g, "");
  if (!country.national.test(digits)) {
    throw new ErrorResponse(
      `Enter a valid ${country.label} mobile number — ${country.hint}`,
      400,
    );
  }
  return `${country.code}${digits}`;
};

/**
 * Validate a full E.164 number against the supported countries and return it
 * unchanged. Throws for anything outside them.
 */
export const parseE164 = (e164: string): string => {
  const trimmed = String(e164).trim();
  for (const country of SUPPORTED_COUNTRIES) {
    if (!trimmed.startsWith(country.code)) continue;
    const national = trimmed.slice(country.code.length);
    if (country.national.test(national)) return trimmed;
  }
  const names = SUPPORTED_COUNTRIES.map((c) => `${c.label} (${c.code})`).join(
    " and ",
  );
  throw new ErrorResponse(`Only ${names} mobile numbers are supported`, 400);
};

/**
 * Normalize whatever a client sent into stored E.164 form. Accepts a number
 * that already carries a country code, or bare national digits paired with an
 * explicit `countryCode`.
 */
export const normalizePhoneInput = (
  raw: unknown,
  countryCode: string = DEFAULT_COUNTRY_CODE,
): string => {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new ErrorResponse("Please provide a phone number", 400);
  }
  const trimmed = raw.trim();
  return trimmed.startsWith("+")
    ? parseE164(trimmed)
    : toE164(countryCode, trimmed);
};

/**
 * Convert the E.164 number embedded in a verified Firebase ID token into the
 * form stored on `User.phone`. Firebase already hands us E.164, so this is
 * purely a supported-country check.
 */
export const fromFirebasePhoneNumber = (e164: string): string =>
  parseE164(e164);

/** Split stored E.164 back into `{ countryCode, national }` for display. */
export const splitE164 = (
  e164: string,
): { countryCode: string; national: string } => {
  for (const country of SUPPORTED_COUNTRIES) {
    if (e164.startsWith(country.code)) {
      return {
        countryCode: country.code,
        national: e164.slice(country.code.length),
      };
    }
  }
  return { countryCode: "", national: e164 };
};
