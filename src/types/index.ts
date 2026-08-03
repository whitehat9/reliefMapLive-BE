import type { UserRole } from "../model/User.js";

/**
 * Lifecycle of a relief marker on the map.
 */
export const MARKER_STATUSES = [
  "providing",
  "provided",
  "needed",
  "assessment_pending",
] as const;
export type MarkerStatus = (typeof MARKER_STATUSES)[number];

/**
 * Categories of relief that can be delivered / requested.
 */
export const RELIEF_ITEMS = [
  "dry_food",
  "cooked_food",
  "drinking_water",
  "clothing",
  "medicine",
  "baby_food",
  "sanitary",
  "tarpaulin",
  "blanket",
  "utensils",
  "other",
] as const;
export type ReliefItem = (typeof RELIEF_ITEMS)[number];

/**
 * Broader, flood-specific catalog of things a Provider can request on the
 * requirements board — distinct from `RELIEF_ITEMS` (map relief-drop vocab).
 * Keep this in sync with `REQUIREMENT_ITEMS` in
 * client/src/lib/requirementItems.ts (the client renders labels for these).
 */
export const REQUIREMENT_ITEMS = [
  // Immediate survival
  "drinking_water",
  "dry_food",
  "cooked_food",
  "baby_food",
  "medicine",
  // Shelter & warmth
  "tarpaulin",
  "temporary_shelter",
  "blanket",
  "clothing",
  "mosquito_net",
  // Hygiene & sanitation
  "sanitary",
  "diapers",
  "toiletries",
  "disinfectant",
  "buckets",
  // Health & rescue
  "ors",
  "chlorine_tablets",
  "antivenom",
  "mobile_medical",
  "boats_rescue",
  // Livestock & essentials
  "cattle_feed",
  "veterinary",
  "utensils",
  "light_source",
  "power_charging",
  // Post-water recession
  "cleaning_help",
  "house_repair",
  "seeds",
  "water_source_disinfection",
  "livelihood_support",
] as const;
export type RequirementItem = (typeof REQUIREMENT_ITEMS)[number];

/**
 * Road-condition report types for the map's "Zeng layer" — anonymous,
 * public-submitted markers distinct from Provider relief drops (`Marker`).
 */
export const ZENG_MARKER_TYPES = [
  "boat",
  "tractor",
  "jcb",
  "broken_embankment",
] as const;
export type ZengMarkerType = (typeof ZENG_MARKER_TYPES)[number];

/**
 * The authenticated identity attached to a request by `protect`.
 */
export interface AuthUser {
  id: string;
  role: UserRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
