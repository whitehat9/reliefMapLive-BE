/**
 * Promote legacy flood-victim accounts to the `Flood-Victim` role.
 *
 * Before the role existed, a victim was a `Provider` carrying an
 * `isFloodVictim: true` flag. The flag can't gate anything server-side, so
 * those accounts currently hold Provider permissions — they can log relief
 * drops and post requirements. This moves them onto the real role.
 *
 * Idempotent: the filter only matches accounts still on the old shape, so
 * re-running is a no-op. `updateMany` bypasses the schema enum validator,
 * which is intentional here — it means the script works even against a
 * database whose server hasn't been redeployed yet.
 *
 * Run:  cd server && npm run migrate:victim-roles -- --dry-run
 *       cd server && npm run migrate:victim-roles
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import UserModel from "../model/User.js";

dotenv.config();

const dryRun = process.argv.includes("--dry-run");

/** Accounts predating the role: flagged as victims but still Providers. */
const LEGACY_VICTIM = { isFloodVictim: true, role: "Provider" } as const;

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is not set in server/.env");

  await mongoose.connect(uri);
  console.log(`Mongo DB connected 🐟${dryRun ? "  (DRY RUN — no writes)" : ""}\n`);

  const pending = await UserModel.countDocuments(LEGACY_VICTIM);
  console.log(`legacy victim accounts (Provider + isFloodVictim): ${pending}`);

  if (pending > 0 && !dryRun) {
    const res = await UserModel.updateMany(LEGACY_VICTIM, {
      $set: { role: "Flood-Victim" },
    });
    console.log(`promoted to Flood-Victim: ${res.modifiedCount}`);
  }

  const byRole = await UserModel.aggregate<{ _id: string; n: number }>([
    { $group: { _id: "$role", n: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  console.log("\n──────── roles after ────────");
  for (const { _id, n } of byRole) console.log(`${String(_id).padEnd(14)} ${n}`);
  if (dryRun) console.log("\nRe-run without --dry-run to apply.");

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Backfill failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
