/**
 * Seed Upper-Assam geography for multiple districts: revenue circles + villages.
 *
 * Each district has a JSON file in ./geography/ shaped as
 * { "<Revenue Circle>": ["<village>", ...] }. A circle with an empty array is
 * still created (so revenue circles show up in dropdowns before their village
 * lists are filled in). The district name is taken from the DISTRICTS list
 * below, not the filename.
 *
 * Idempotent: finds-or-creates each district, revenue circle, and village.
 * Village uniqueness is { district, revenueCircle, name }, so the same village
 * name may exist under different circles — but an exact repeat within one circle
 * is deduped (kept once). Safe to re-run.
 *
 * Run:  cd server && npm run seed:geography
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import mongoose from "mongoose";
import dotenv from "dotenv";
import DistrictModel from "../model/District.js";
import RevenueCircleModel from "../model/RevenueCircle.js";
import VillageModel from "../model/Village.js";

dotenv.config();

/** District display name -> its geography JSON file (in ./geography). */
const DISTRICTS: { name: string; file: string }[] = [
  { name: "Sivasagar", file: "sivasagar.json" },
  { name: "Charaideo", file: "charaideo.json" },
  { name: "Jorhat", file: "jorhat.json" },
  { name: "Golaghat", file: "golaghat.json" },
];

const __dirname = dirname(fileURLToPath(import.meta.url));

const loadGeography = (file: string): Record<string, string[]> =>
  JSON.parse(readFileSync(join(__dirname, "geography", file), "utf-8"));

async function seedDistrict(districtName: string, file: string) {
  const geography = loadGeography(file);

  // 1. Find-or-create the district.
  const district = await DistrictModel.findOneAndUpdate(
    { name: districtName },
    { $setOnInsert: { name: districtName } },
    { new: true, upsert: true },
  );

  let inserted = 0;
  let dupes = 0;

  console.log(`\n=== ${districtName} (${district._id}) ===`);

  for (const [circleName, rawVillages] of Object.entries(geography)) {
    // 2. Find-or-create the revenue circle (unique per { district, name }).
    const circle = await RevenueCircleModel.findOneAndUpdate(
      { district: district._id, name: circleName },
      { $setOnInsert: { district: district._id, name: circleName } },
      { new: true, upsert: true },
    );

    // 3. Dedupe within this circle (case-insensitive, keep first spelling).
    const seen = new Map<string, string>();
    for (const raw of rawVillages) {
      const name = raw.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!seen.has(key)) seen.set(key, name);
    }
    const uniqueNames = [...seen.values()];
    const dupCount = rawVillages.length - uniqueNames.length;

    // 4. Skip villages already stored under this district + circle.
    const existing = await VillageModel.find({
      district: district._id,
      revenueCircle: circle._id,
    }).select("name");
    const existingKeys = new Set(existing.map((v) => v.name.trim().toLowerCase()));
    const toInsert = uniqueNames.filter((n) => !existingKeys.has(n.toLowerCase()));

    if (toInsert.length > 0) {
      await VillageModel.insertMany(
        toInsert.map((name) => ({
          name,
          district: district._id,
          revenueCircle: circle._id,
        })),
        { ordered: false },
      );
    }

    inserted += toInsert.length;
    dupes += dupCount;
    console.log(
      `${circleName.padEnd(12)} listed:${String(rawVillages.length).padStart(4)}` +
        `  dups:${String(dupCount).padStart(2)}` +
        `  inserted:${String(toInsert.length).padStart(4)}` +
        `  circleTotal:${String(
          await VillageModel.countDocuments({
            district: district._id,
            revenueCircle: circle._id,
          }),
        ).padStart(4)}`,
    );
  }

  const total = await VillageModel.countDocuments({ district: district._id });
  console.log(
    `— circles:${Object.keys(geography).length}  inserted:${inserted}  intra-circle dupes:${dupes} (skipped)  total villages:${total}`,
  );
  return { inserted, dupes };
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is not set in server/.env");

  await mongoose.connect(uri);
  console.log("Mongo DB connected 🐟");

  let grandInserted = 0;
  for (const { name, file } of DISTRICTS) {
    const { inserted } = await seedDistrict(name, file);
    grandInserted += inserted;
  }

  console.log("\n──────── summary ────────");
  console.log(`districts        : ${DISTRICTS.length}`);
  console.log(`villages inserted: ${grandInserted} (this run)`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Seed failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
