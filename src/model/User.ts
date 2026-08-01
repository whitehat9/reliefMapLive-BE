import mongoose, { Document, Schema } from "mongoose";
import { generateToken } from "../utils/jwt.js";

export type UserRole = "Super-Admin" | "Provider";

export interface IUser extends Document {
  name: string;
  phone: string;
  role: UserRole;
  isDisabled: boolean;

  // Firebase Auth uid for this phone number. Bound the first time this user
  // completes a real phone-OTP login; unset for a freshly-seeded Super-Admin
  // who hasn't logged in yet.
  firebaseUid?: string | undefined;

  // Provider-only: street/postal address of the provider or their organization.
  address?: string;

  // Active refresh tokens — one per logged-in device/session. Used for
  // refresh-token rotation and reuse detection; never exposed to clients.
  refreshTokens: string[];

  // Provider-only
  organizationName?: string;

  createdAt: Date;
  updatedAt: Date;
  getSignedJwtToken(): string;
}

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, "Please add a name"],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, "Please add a phone number"],
      unique: true,
      trim: true,
      match: [/^[6-9]\d{9}$/, "Please provide a valid 10-digit phone number"],
    },
    role: {
      type: String,
      enum: ["Super-Admin", "Provider"],
      required: true,
    },
    isDisabled: {
      type: Boolean,
      default: false,
    },
    firebaseUid: {
      type: String,
      unique: true,
      sparse: true,
    },
    refreshTokens: {
      type: [String],
      default: [],
    },
    organizationName: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
      maxlength: [200, "Address cannot exceed 200 characters"],
    },
  },
  {
    timestamps: true,
  },
);

// Sign JWT and return
UserSchema.methods.getSignedJwtToken = function (): string {
  return generateToken({
    id: this._id,
    role: this.role,
  });
};

const UserModel = mongoose.model<IUser>("User", UserSchema);

export default UserModel;
