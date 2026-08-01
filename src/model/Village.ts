import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IVillage extends Document {
  _id: Types.ObjectId;
  name: string;
  district: Types.ObjectId;
  /** Revenue circle is optional — a village may sit directly under a district. */
  revenueCircle?: Types.ObjectId;
  /** Center of the flood-affected village (kept in sync with any box). */
  lat?: number;
  lng?: number;
  /** Rectangular flood-affected zone drawn by the Super-Admin. */
  bounds?: { north: number; south: number; east: number; west: number };
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const VillageSchema = new Schema<IVillage>(
  {
    name: {
      type: String,
      required: [true, "Please add a village name"],
      trim: true,
    },
    district: {
      type: Schema.Types.ObjectId,
      ref: "District",
      required: true,
      index: true,
    },
    revenueCircle: {
      type: Schema.Types.ObjectId,
      ref: "RevenueCircle",
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

VillageSchema.index({ district: 1, revenueCircle: 1, name: 1 }, { unique: true });

const VillageModel = mongoose.model<IVillage>("Village", VillageSchema);

export default VillageModel;
