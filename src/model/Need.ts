import mongoose, { Schema, type Document, type Types } from "mongoose";
import { RELIEF_ITEMS, type ReliefItem } from "../types/index.js";
import { USER_ROLES, type UserRole } from "./User.js";

/**
 * A request for relief — "we need these things, here".
 *
 * Location is either a free-typed `locationName`, GPS `lat`/`lng`, or both.
 * The administrative fields below are optional and only populated by older
 * rows and provider-side flows: someone stranded in a flood knows the name of
 * their tole, not which revenue circle it falls under.
 *
 * Does NOT create a map marker.
 */
export interface INeed extends Document {
  _id: Types.ObjectId;
  /** Free-typed place name — the primary way a request states where it is. */
  locationName?: string;
  district?: string;
  revenueCircle?: string;
  villageName?: string;
  items: ReliefItem[];
  note?: string;
  lat?: number;
  lng?: number;
  createdBy: Types.ObjectId;
  providerName: string;
  /**
   * Author's phone, denormalized so providers can call without a second
   * lookup. PRIVATE: never returned by the public `GET /api/needs` — see
   * `getUrgentNeeds`, which projects it away.
   */
  contactPhone?: string;
  /** Role of the author. `providerName` predates victims being able to post. */
  createdByRole?: UserRole;
  providerOrg?: string;
  isResolved: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NeedSchema = new Schema<INeed>(
  {
    locationName: { type: String, trim: true },
    // Optional since victims type a place name instead. Still indexed: older
    // rows carry it and provider-side flows may set it.
    district: { type: String, trim: true, index: true },
    revenueCircle: { type: String, trim: true },
    villageName: { type: String, trim: true },
    items: {
      type: [{ type: String, enum: RELIEF_ITEMS }],
      validate: {
        validator: (v: unknown[]) => Array.isArray(v) && v.length > 0,
        message: "Please list at least one needed item",
      },
    },
    note: { type: String, trim: true },
    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    providerName: { type: String, required: true, trim: true },
    contactPhone: { type: String, trim: true },
    createdByRole: { type: String, enum: [...USER_ROLES] },
    providerOrg: { type: String, trim: true },
    isResolved: { type: Boolean, default: false, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

NeedSchema.index({ createdAt: -1 });

const NeedModel = mongoose.model<INeed>("Need", NeedSchema);

export default NeedModel;
