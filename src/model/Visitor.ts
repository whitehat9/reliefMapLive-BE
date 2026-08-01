import mongoose, { Schema, type Document, type Types } from "mongoose";

/**
 * A single global visitor counter. One document (keyed "global") holds the
 * running total of site visits; the count is bumped atomically via $inc.
 */
export interface IVisitor extends Document {
  _id: Types.ObjectId;
  key: string;
  count: number;
  createdAt: Date;
  updatedAt: Date;
}

const VisitorSchema = new Schema<IVisitor>(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    count: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const VisitorModel = mongoose.model<IVisitor>("Visitor", VisitorSchema);

export default VisitorModel;
