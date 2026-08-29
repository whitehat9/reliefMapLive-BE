/**
 * Seed Nepal geography for the flood-affected districts: the local units
 * (municipalities / rural municipalities) under each, plus their settlements.
 *
 * Each district has a JSON file in ./geography/ shaped as
 * { "<Municipality>": ["<settlement>", ...] }. A unit with an empty array is
 * still created (so it shows up in dropdowns before its settlement list is
 * filled in) — most rural municipalities start empty and are filled in by the
 * Super-Admin locally. The district name is taken from the DISTRICTS list
 * below, not the filename.
 *
 * NOTE: the storage tier is still called `RevenueCircle` in the schema; for
 * Nepal it holds the municipality / rural municipality. The UI labels it
 * "Municipality".
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

/** District display name -> its geography JSON file (in ./geography).
 * The Terai belt (Koshi/Narayani/Rapti/Karnali flood plains) plus the central
 * hill districts around the Kathmandu valley. */
const DISTRICTS: { name: string; file: string }[] = [
  { name: "Kathmandu", file: "kathmandu.json" },
  { name: "Lalitpur", file: "lalitpur.json" },
  { name: "Bhaktapur", file: "bhaktapur.json" },
  { name: "Makwanpur", file: "makwanpur.json" },
  { name: "Chitwan", file: "chitwan.json" },
  { name: "Sunsari", file: "sunsari.json" },
  { name: "Saptari", file: "saptari.json" },
  { name: "Banke", file: "banke.json" },
  { name: "Bardiya", file: "bardiya.json" },
  { name: "Kailali", file: "kailali.json" },
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
