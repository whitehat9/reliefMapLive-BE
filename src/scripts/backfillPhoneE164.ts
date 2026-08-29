/**
 * Convert stored phone numbers from bare national digits to E.164.
 *
 * The app used to be India-only, so `User.phone` and `Requirement.phoneNumber`
 * hold bare 10-digit numbers with no country code. Now that Nepal (+977) is
 * supported too, that format is ambiguous *and* unsafe: `User.phone` is a
 * unique index, and a Nepali 98… number is the same ten digits as an Indian
 * 98… number. Two different people would collide on one account.
 *
 * Every pre-existing row is Indian, so bare numbers get a `+91` prefix.
 *
 * Idempotent: rows already starting with "+" are skipped, so this is safe to
 * re-run. Run with --dry-run first to see the counts without writing.
 *
 * Goes through the raw driver rather than the Mongoose models, so it works
 * against a database whose server hasn't been redeployed yet and isn't
 * blocked by schema validators mid-migration.
 *
 * Run:  cd server && npm run migrate:phone-e164 -- --dry-run
 *       cd server && npm run migrate:phone-e164
 */
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

/** Country every legacy row belongs to — the app's original deployment. */
const LEGACY_PREFIX = "+91";

const dryRun = process.argv.includes("--dry-run");

/** Bare national digits, i.e. anything not already in E.164 form. */
const BARE = /^\d{10}$/;

async function backfill(collectionName: string, field: string) {
  const collection = mongoose.connection.collection(collectionName);

  // Small collections (hundreds of rows), and `updateMany` can't build a value
  // from another field — so read-modify-write, which also lets us report
  // exactly what changed.
  const docs = await collection
    .find({ [field]: { $not: /^\+/ } })
    .project({ [field]: 1 })
    .toArray();

  let converted = 0;
  let skipped = 0;

  for (const doc of docs) {
    const current = String(doc[field] ?? "");
    if (!BARE.test(current)) {
      skipped += 1;
      console.warn(
        `  ! ${collectionName} ${String(doc._id)}: unexpected format "${current}" — left alone`,
      );
      continue;
    }
    if (!dryRun) {
      await collection.updateOne(
        { _id: doc._id },
        { $set: { [field]: `${LEGACY_PREFIX}${current}` } },
      );
    }
    converted += 1;
  }

  const total = await collection.countDocuments();
  console.log(
    `${collectionName.padEnd(14)} total:${String(total).padStart(5)}` +
      `  converted:${String(converted).padStart(5)}` +
      `  skipped:${String(skipped).padStart(3)}`,
  );
  return converted;
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is not set in server/.env");

  await mongoose.connect(uri);
  console.log(
    `Mongo DB connected 🐟${dryRun ? "  (DRY RUN — no writes)" : ""}\n`,
  );

  const users = await backfill("users", "phone");
  const reqs = await backfill("requirements", "phoneNumber");

  console.log("\n──────── summary ────────");
  console.log(
    `rows ${dryRun ? "that would be " : ""}converted: ${users + reqs}`,
  );
  if (dryRun) console.log("Re-run without --dry-run to apply.");

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Backfill failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
