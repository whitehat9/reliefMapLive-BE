import { Schema, model, type Document, type Model, type Types } from "mongoose";
import {
  MARKER_STATUSES,
  RELIEF_ITEMS,
  type MarkerStatus,
  type ReliefItem,
} from "../types/index.js";

/** A marker "lives" (is shown as active on the map) for 24 hours. */
export const MARKER_TTL_MS = 24 * 60 * 60 * 1000;

export interface IMarker {
  /** Administrative location (one of this, or lat/lng, must be set). */
  district?: string;
  revenueCircle?: string;
  villageName?: string;
  landmark?: string;
  /** Precise coordinates (one of these, or district, must be set). */
  lat?: number;
  lng?: number;
  /** GeoJSON mirror of lat/lng, maintained automatically for $near queries */
  location?: { type: "Point"; coordinates: [number, number] } | undefined;
  date: Date;
  time: string;
  status: MarkerStatus;
  items: ReliefItem[];
  /** How many families/units of relief were delivered at this marker. */
  reliefDeliveredCount: number;
  familiesCount?: number;
  estimatedPeople?: number;
  /** Monetary value (₹) of relief given at this drop. */
  amount?: number;
  photos: string[];
  createdBy: Types.ObjectId;
  providerName: string;
  providerOrg: string;
  providerContact: string;
  /** True for a retroactively-logged drop — record only, never shown live on the map. */
  isPreviouslyDelivered: boolean;
  /** When the marker stops being "active" on the map (createdAt + 24h). */
  expiresAt: Date;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMarkerDocument extends IMarker, Document {
  _id: Types.ObjectId;
}

const markerSchema = new Schema<IMarkerDocument>(
  {
    district: { type: String, trim: true, index: true },
    revenueCircle: { type: String, trim: true, index: true },
    villageName: { type: String, trim: true, index: true },
    landmark: { type: String, trim: true },

    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 },
    location: {
      type: { type: String, enum: ["Point"] },
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
    },

    date: { type: Date, required: true, default: () => new Date() },
    time: { type: String, required: true },

    status: {
      type: String,
      enum: MARKER_STATUSES,
      required: true,
      default: "provided",
      index: true,
    },
    items: [{ type: String, enum: RELIEF_ITEMS }],
    reliefDeliveredCount: { type: Number, min: 0, default: 0 },
    familiesCount: { type: Number, min: 0 },
    estimatedPeople: { type: Number, min: 0 },
    amount: { type: Number, min: 0 },
    photos: [{ type: String }],

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    providerName: { type: String, required: true, trim: true },
    providerOrg: { type: String, required: true, trim: true },
    providerContact: { type: String, required: true, trim: true },

    isPreviouslyDelivered: { type: Boolean, default: false, index: true },

    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + MARKER_TTL_MS),
      index: true,
    },

    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

markerSchema.index({ location: "2dsphere" });
markerSchema.index({ createdAt: -1 });

// Keep GeoJSON location in sync with lat/lng on any write. Markers can be
// created without coordinates (district-only "area" mode) — leave `location`
// unset in that case, since a partial GeoJSON object breaks the 2dsphere index.
markerSchema.pre("validate", function syncLocation() {
  if (typeof this.lat === "number" && typeof this.lng === "number") {
    this.location = { type: "Point", coordinates: [this.lng, this.lat] };
  } else {
    this.location = undefined;
  }
});

markerSchema.set("toJSON", {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform(_doc: unknown, ret: any) {
    delete ret.__v;
    return ret;
  },
});

export const Marker: Model<IMarkerDocument> = model<IMarkerDocument>(
  "Marker",
  markerSchema,
);

export default Marker;
