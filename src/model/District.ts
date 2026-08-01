import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface IDistrict extends Document {
  _id: Types.ObjectId;
  name: string;
  /** Center of the flood-affected district (set by Super-Admin on the map).
   * When a rectangle is drawn, this is kept in sync with the box center. */
  lat?: number;
  lng?: number;
  /** Rectangular flood-affected zone drawn by the Super-Admin. */
  bounds?: { north: number; south: number; east: number; west: number };
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DistrictSchema = new Schema<IDistrict>(
  {
    name: {
      type: String,
      required: [true, "Please add a district name"],
      unique: true,
      trim: true,
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

const DistrictModel = mongoose.model<IDistrict>("District", DistrictSchema);

export default DistrictModel;
