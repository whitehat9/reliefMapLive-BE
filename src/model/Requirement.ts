import mongoose, { Schema, type Document, type Types } from "mongoose";
import { REQUIREMENT_ITEMS, type RequirementItem } from "../types/index.js";
import { E164_LOOSE } from "../utils/phone.js";

/** Coordination lifecycle of a requirement on the shared board. */
export const REQUIREMENT_STATUSES = ["open", "planning", "provided"] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

/**
 * A requirement one Provider posts so that other, future Providers can see
 * what's needed where and respond. Distinct from `Need` (checkbox items,
 * powers the public homepage widget) — this is freeform text + an optional
 * headcount, and is only ever visible to Providers and the Super-Admin.
 */
export interface IRequirement extends Document {
  _id: Types.ObjectId;
  items: RequirementItem[];
  message: string;
  phoneNumber: string;
  count?: number;
  lat?: number;
  lng?: number;
  createdBy: Types.ObjectId;
  providerName: string;
  providerOrg?: string;
  providerContact?: string;
  status: RequirementStatus;
  claimedBy?: Types.ObjectId | undefined;
  claimedByName?: string | undefined;
  claimedByOrg?: string | undefined;
  isResolved: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RequirementSchema = new Schema<IRequirement>(
  {
    items: { type: [String], enum: REQUIREMENT_ITEMS, default: [] },
    message: { type: String, trim: true, maxlength: 2000 },
    phoneNumber: {
      type: String,
      required: [true, "Please add a phone number"],
      trim: true,
      match: [E164_LOOSE, "Please provide a valid phone number"],
    },
    count: { type: Number, min: 0 },
    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    providerName: { type: String, required: true, trim: true },
    providerOrg: { type: String, trim: true },
    providerContact: { type: String, trim: true },
    status: {
      type: String,
      enum: REQUIREMENT_STATUSES,
      default: "open",
      index: true,
    },
    claimedBy: { type: Schema.Types.ObjectId, ref: "User" },
    claimedByName: { type: String, trim: true },
    claimedByOrg: { type: String, trim: true },
    isResolved: { type: Boolean, default: false, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

RequirementSchema.index({ createdAt: -1 });

const RequirementModel = mongoose.model<IRequirement>(
  "Requirement",
  RequirementSchema,
);

export default RequirementModel;
