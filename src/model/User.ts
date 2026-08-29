import mongoose, { Document, Schema } from "mongoose";
import { generateToken } from "../utils/jwt.js";
import { E164_LOOSE } from "../utils/phone.js";

/**
 * Single source of truth for roles — the schema enum below spreads this, so the
 * union and the validator can no longer drift apart.
 *
 * `Flood-Victim` is someone asking for relief; `Provider` is someone delivering
 * it. They were one role plus an `isFloodVictim` flag until the flag proved
 * unable to gate anything server-side.
 */
export const USER_ROLES = ["Super-Admin", "Provider", "Flood-Victim"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface IUser extends Document {
  name: string;
  phone: string;
  role: UserRole;
  isDisabled: boolean;

  // True once this user has completed a real Firebase phone-OTP challenge.
  // Victims who registered through the offline bypass skip OTP, so they start
  // unverified and become verified the first time they sign in with a code.
  isPhoneVerified: boolean;

  // Legacy compatibility flag, kept in sync with `role === "Flood-Victim"`.
  // Authorization reads the role, never this. Accounts created before the role
  // existed carry `role: "Provider"` with this set true; the backfill script
  // `scripts/backfillVictimRole.ts` promotes them.
  isFloodVictim: boolean;

  // Firebase Auth uid for this phone number. Bound the first time this user
  // completes a real phone-OTP login; unset for a freshly-seeded Super-Admin
  // who hasn't logged in yet.
  firebaseUid?: string | undefined;

  // Provider-only: street/postal address of the provider or their organization.
  address?: string;

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
      // Permissive on purpose: `login` calls save() on every sign-in, so this
      // must accept every row that will ever exist, including legacy ones.
      // Strict per-country checks live in utils/phone.ts at the API boundary.
      match: [E164_LOOSE, "Please provide a valid phone number"],
    },
    role: {
      type: String,
      enum: [...USER_ROLES],
      required: true,
    },
    isDisabled: {
      type: Boolean,
      default: false,
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    isFloodVictim: {
      type: Boolean,
      default: false,
    },
    firebaseUid: {
      type: String,
      unique: true,
      sparse: true,
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
