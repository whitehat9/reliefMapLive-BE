import mongoose, { Schema, type Document, type Types } from "mongoose";
import { RELIEF_ITEMS, type ReliefItem } from "../types/index.js";

/**
 * An "urgent need" raised via the optional extra form after a relief drop.
 * These power the homepage "Urgent need" tab. They do NOT create map markers.
 */
export interface INeed extends Document {
  _id: Types.ObjectId;
  district: string;
  revenueCircle?: string;
  villageName?: string;
  items: ReliefItem[];
  note?: string;
  lat?: number;
  lng?: number;
  createdBy: Types.ObjectId;
  providerName: string;
  providerOrg?: string;
  isResolved: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NeedSchema = new Schema<INeed>(
  {
    district: { type: String, required: true, trim: true, index: true },
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
    providerOrg: { type: String, trim: true },
    isResolved: { type: Boolean, default: false, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

NeedSchema.index({ createdAt: -1 });

const NeedModel = mongoose.model<INeed>("Need", NeedSchema);

export default NeedModel;
