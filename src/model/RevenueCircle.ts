import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IRevenueCircle extends Document {
  _id: Types.ObjectId;
  name: string;
  district: Types.ObjectId;
  /** Center of the flood-affected revenue circle (kept in sync with any box). */
  lat?: number;
  lng?: number;
  /** Rectangular flood-affected zone drawn by the Super-Admin. */
  bounds?: { north: number; south: number; east: number; west: number };
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RevenueCircleSchema = new Schema<IRevenueCircle>(
  {
    name: {
      type: String,
      required: [true, "Please add a revenue circle name"],
      trim: true,
    },
    district: {
      type: Schema.Types.ObjectId,
      ref: "District",
      required: true,
      index: true,
    },
    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 },
    bounds: {
      type: new Schema(
        {
          north: { type: Number, min: -90, max: 90 },
          south: { type: Number, min: -90, max: 90 },
          east: { type: Number, min: -180, max: 180 },
          west: { type: Number, min: -180, max: 180 },
        },
        { _id: false },
      ),
      default: undefined,
    },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

// A revenue circle name must be unique within its district.
RevenueCircleSchema.index({ district: 1, name: 1 }, { unique: true });

const RevenueCircleModel = mongoose.model<IRevenueCircle>(
  "RevenueCircle",
  RevenueCircleSchema,
);

export default RevenueCircleModel;
