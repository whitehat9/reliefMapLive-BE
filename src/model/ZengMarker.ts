import { Schema, model, type Document, type Model, type Types } from "mongoose";
import { ZENG_MARKER_TYPES, type ZengMarkerType } from "../types/index.js";

export interface IZengMarker {
  type: ZengMarkerType;
  lat: number;
  lng: number;
  /** Driver/vehicle contact number — required for boat & tractor reports. */
  contactNumber?: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IZengMarkerDocument extends IZengMarker, Document {
  _id: Types.ObjectId;
}

const zengMarkerSchema = new Schema<IZengMarkerDocument>(
  {
    type: {
      type: String,
      enum: ZENG_MARKER_TYPES,
      required: true,
      index: true,
    },
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
    contactNumber: { type: String, trim: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

zengMarkerSchema.index({ createdAt: -1 });

zengMarkerSchema.set("toJSON", {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform(_doc: unknown, ret: any) {
    delete ret.__v;
    return ret;
  },
});

export const ZengMarker: Model<IZengMarkerDocument> = model<IZengMarkerDocument>(
  "ZengMarker",
  zengMarkerSchema,
);

export default ZengMarker;
