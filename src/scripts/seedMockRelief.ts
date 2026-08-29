/**
 * Seed mock relief drops along the Pasang Lhamu Highway — demo data for
 * screen recordings, not a fixture any real deployment should carry.
 *
 * The highway runs north out of Kathmandu through Nuwakot into Rasuwa, so the
 * five drops below trace that corridor: Balaju → Kakani → Bidur (Trishuli) →
 * Dhunche → Syafrubesi. Each one belongs to a different mock Provider, which
 * is what makes them show up as five separate rows in the victim dashboard's
 * "Rescuers near you" tab (`NearbyRescuersList` keys rows by provider contact
 * and keeps one row per provider, so five drops by one provider would collapse
 * into one row).
 *
 * The markers are created ACTIVE — staggered over the last few hours with
 * `expiresAt = createdAt + 24h` — because `GET /api/markers` only returns
 * unexpired ones and that feed is the sole source for the rescuers tab.
 *
 * It also fills the provider dashboard's two other tabs from the same
 * corridor, so one command sets up a whole recording:
 *   - "People need help"      — five Needs, each by a mock Flood-Victim.
 *                               `GET /needs/help-requests` filters on
 *                               `createdByRole: "Flood-Victim"`, so a Need
 *                               posted by a Provider would never appear there.
 *   - "Requirements board"    — five Requirements, posted by the five mock
 *                               Providers above.
 *
 * Development only: refuses to run unless NODE_ENV === "development", so a
 * stray invocation can't inject fake rescuers into the live map.
 *
 * Idempotent: a re-run deletes the previous mock markers and writes fresh ones,
 * which is also how you refresh their 24h window before a recording.
 *
 * Run:  cd server && npm run seed:mock-relief
 *       cd server && npm run seed:mock-relief -- --clear   # remove it all
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import UserModel from "../model/User.js";
import MarkerModel, { MARKER_TTL_MS } from "../model/Marker.js";
import NeedModel from "../model/Need.js";
import RequirementModel from "../model/Requirement.js";
import type {
  MarkerStatus,
  ReliefItem,
  RequirementItem,
} from "../types/index.js";

dotenv.config();

/**
 * Mock accounts — Providers (…1xx) and Flood-Victims (…2xx) — are all under
 * this +977 block so `--clear` can find them by prefix alone: no document has
 * to carry a "this is fake" flag, and no real Nepali number can collide
 * (nothing is issued as 98010001xx / 98010002xx).
 */
const MOCK_PHONE_PREFIX = "+9779801000";

interface MockDrop {
  /** National digits appended to MOCK_PHONE_PREFIX — keep these distinct. */
  phoneSuffix: string;
  name: string;
  org: string;
  district: string;
  /** Municipality / rural municipality (stored under the legacy key). */
  revenueCircle: string;
  villageName: string;
  landmark: string;
  lat: number;
  lng: number;
  status: MarkerStatus;
  items: ReliefItem[];
  reliefDeliveredCount: number;
  familiesCount: number;
  estimatedPeople: number;
  amount: number;
  /** How long ago this drop was logged, in minutes — drives "last relief …". */
  minutesAgo: number;
}

/** South to north along the highway, Kathmandu → Nuwakot → Rasuwa. */
const DROPS: MockDrop[] = [
  {
    phoneSuffix: "101",
    name: "Pemba Sherpa",
    org: "Langtang Relief Collective",
    district: "Kathmandu",
    revenueCircle: "Kathmandu Metropolitan City",
    villageName: "Balaju",
    landmark: "Balaju bypass, Pasang Lhamu Highway km 0",
    lat: 27.7351,
    lng: 85.3021,
    status: "provided",
    items: ["drinking_water", "dry_food", "tarpaulin"],
    reliefDeliveredCount: 120,
    familiesCount: 120,
    estimatedPeople: 540,
    amount: 185000,
    minutesAgo: 35,
  },
  {
    phoneSuffix: "102",
    name: "Sunita Tamang",
    org: "Nuwakot Youth Network",
    district: "Nuwakot",
    revenueCircle: "Kakani Rural Municipality",
    villageName: "Kakani",
    landmark: "Kakani checkpoint, highway shoulder",
    lat: 27.8125,
    lng: 85.247,
    status: "providing",
    items: ["cooked_food", "blanket", "medicine"],
    reliefDeliveredCount: 64,
    familiesCount: 64,
    estimatedPeople: 280,
    amount: 96000,
    minutesAgo: 80,
  },
  {
    phoneSuffix: "103",
    name: "Rajendra Ghale",
    org: "Trishuli Rescue Volunteers",
    district: "Nuwakot",
    revenueCircle: "Bidur Municipality",
    villageName: "Trishuli Bazar",
    landmark: "Trishuli bridge, east bank",
    lat: 27.872,
    lng: 85.159,
    status: "provided",
    items: ["dry_food", "drinking_water", "sanitary", "baby_food"],
    reliefDeliveredCount: 210,
    familiesCount: 210,
    estimatedPeople: 910,
    amount: 320000,
    minutesAgo: 145,
  },
  {
    phoneSuffix: "104",
    name: "Dawa Lama",
    org: "Rasuwa Mountain Aid",
    district: "Rasuwa",
    revenueCircle: "Gosaikunda Rural Municipality",
    villageName: "Dhunche",
    landmark: "Dhunche bus park",
    lat: 28.1119,
    lng: 85.2966,
    status: "provided",
    items: ["blanket", "clothing", "utensils"],
    reliefDeliveredCount: 88,
    familiesCount: 88,
    estimatedPeople: 372,
    amount: 141000,
    minutesAgo: 240,
  },
  {
    phoneSuffix: "105",
    name: "Mingma Dolma Tamang",
    org: "Syafrubesi Community Kitchen",
    district: "Rasuwa",
    revenueCircle: "Gosaikunda Rural Municipality",
    villageName: "Syafrubesi",
    landmark: "Bhote Koshi bridge, Syafrubesi bazaar",
    lat: 28.1594,
    lng: 85.3369,
    status: "providing",
    items: ["cooked_food", "drinking_water", "medicine", "tarpaulin"],
    reliefDeliveredCount: 150,
    familiesCount: 150,
    estimatedPeople: 620,
    amount: 205000,
    minutesAgo: 310,
  },
];

/** One person asking for help — fills the "People need help" tab. */
interface MockNeed {
  phoneSuffix: string;
  name: string;
  locationName: string;
  district: string;
  items: ReliefItem[];
  note: string;
  lat: number;
  lng: number;
  minutesAgo: number;
}

/** Victims sit on the same corridor as the drops, so the map reads as one story. */
const NEEDS: MockNeed[] = [
  {
    phoneSuffix: "201",
    name: "Kumar Tamang",
    locationName: "Balaju, ward 16",
    district: "Kathmandu",
    items: ["dry_food", "drinking_water"],
    note: "Ground floor is under water. Eight families waiting on the roof.",
    lat: 27.7368,
    lng: 85.3044,
    minutesAgo: 25,
  },
  {
    phoneSuffix: "202",
    name: "Sarita Gurung",
    locationName: "Kakani bazaar",
    district: "Nuwakot",
    items: ["cooked_food", "blanket", "medicine"],
    note: "Landslide cut the road above us. No cooking gas since morning.",
    lat: 27.8109,
    lng: 85.2492,
    minutesAgo: 70,
  },
  {
    phoneSuffix: "203",
    name: "Bishnu Shrestha",
    locationName: "Trishuli Bazar, near the old bridge",
    district: "Nuwakot",
    items: ["drinking_water", "sanitary", "baby_food"],
    note: "Two infants here and the handpump is submerged.",
    lat: 27.8703,
    lng: 85.1571,
    minutesAgo: 130,
  },
  {
    phoneSuffix: "204",
    name: "Nima Lama",
    locationName: "Dhunche, upper tole",
    district: "Rasuwa",
    items: ["tarpaulin", "blanket", "clothing"],
    note: "Roofs blown off. Four families sleeping in the school hall.",
    lat: 28.1103,
    lng: 85.2941,
    minutesAgo: 205,
  },
  {
    phoneSuffix: "205",
    name: "Phurba Tamang",
    locationName: "Syafrubesi bazaar",
    district: "Rasuwa",
    items: ["medicine", "drinking_water", "dry_food"],
    note: "Elderly man out of blood-pressure medicine. Bridge is under water.",
    lat: 28.1581,
    lng: 85.3352,
    minutesAgo: 285,
  },
];

/**
 * One post on the requirements board. Authored by the mock Providers above —
 * `providerSuffix` points at a DROPS entry, so the board and the map agree on
 * who is where.
 */
interface MockRequirement {
  providerSuffix: string;
  items: RequirementItem[];
  message: string;
  count: number;
  minutesAgo: number;
}

const REQUIREMENTS: MockRequirement[] = [
  {
    providerSuffix: "101",
    items: ["boats_rescue", "light_source"],
    message:
      "Need one more boat and a set of floodlights at the Balaju bypass tonight — we are pulling people off roofs after dark.",
    count: 40,
    minutesAgo: 45,
  },
  {
    providerSuffix: "102",
    items: ["cooked_food", "ors", "mosquito_net"],
    message:
      "Kakani shelter is holding 64 people. Our kitchen runs out by tomorrow noon.",
    count: 64,
    minutesAgo: 95,
  },
  {
    providerSuffix: "103",
    items: ["chlorine_tablets", "water_source_disinfection", "buckets"],
    message:
      "Wells around Trishuli Bazar are contaminated. Need chlorine and buckets before people start drinking from them.",
    count: 210,
    minutesAgo: 160,
  },
  {
    providerSuffix: "104",
    items: ["temporary_shelter", "blanket", "cattle_feed"],
    message:
      "Dhunche: about 20 households lost their roofs, and the livestock has not been fed for two days.",
    count: 88,
    minutesAgo: 250,
  },
  {
    providerSuffix: "105",
    items: ["mobile_medical", "medicine", "power_charging"],
    message:
      "Syafrubesi needs a medical camp — no electricity for two days and the health post is cut off.",
    count: 150,
    minutesAgo: 330,
  },
];

const phoneOf = (d: MockDrop): string => `${MOCK_PHONE_PREFIX}${d.phoneSuffix}`;

/** Delete every mock document and account. Also the first half of a re-seed. */
async function clearMock(): Promise<{
  markers: number;
  needs: number;
  requirements: number;
  users: number;
}> {
  const users = await UserModel.find({
    phone: { $regex: `^\\${MOCK_PHONE_PREFIX}` },
  }).select("_id");
  const ids = users.map((u) => u._id);

  const markers = await MarkerModel.deleteMany({ createdBy: { $in: ids } });
  const needs = await NeedModel.deleteMany({ createdBy: { $in: ids } });
  const reqs = await RequirementModel.deleteMany({ createdBy: { $in: ids } });
  const removed = await UserModel.deleteMany({ _id: { $in: ids } });
  return {
    markers: markers.deletedCount ?? 0,
    needs: needs.deletedCount ?? 0,
    requirements: reqs.deletedCount ?? 0,
    users: removed.deletedCount ?? 0,
  };
}

/** Find-or-create one mock account, so every seeder shares the same shape. */
async function upsertMockUser(
  phone: string,
  name: string,
  role: "Provider" | "Flood-Victim",
  org?: string,
) {
  return UserModel.findOneAndUpdate(
    { phone },
    {
      $set: {
        name,
        role,
        isFloodVictim: role === "Flood-Victim",
        isPhoneVerified: true,
        isDisabled: false,
        ...(org ? { organizationName: org } : {}),
      },
    },
    { returnDocument: "after", upsert: true },
  );
}

async function seedMock(): Promise<void> {
  const now = Date.now();

  for (const drop of DROPS) {
    const phone = phoneOf(drop);
    const provider = await upsertMockUser(phone, drop.name, "Provider", drop.org);

    const createdAt = new Date(now - drop.minutesAgo * 60_000);
    await MarkerModel.create(
      [
        {
          district: drop.district,
          revenueCircle: drop.revenueCircle,
          villageName: drop.villageName,
          landmark: drop.landmark,
          lat: drop.lat,
          lng: drop.lng,
          date: createdAt,
          time: createdAt.toTimeString().slice(0, 5),
          status: drop.status,
          items: drop.items,
          reliefDeliveredCount: drop.reliefDeliveredCount,
          familiesCount: drop.familiesCount,
          estimatedPeople: drop.estimatedPeople,
          amount: drop.amount,
          photos: [],
          createdBy: provider._id,
          providerName: drop.name,
          providerOrg: drop.org,
          providerContact: phone,
          isPreviouslyDelivered: false,
          // Active for a full 24h from when the drop claims to have happened,
          // so the whole set stays live through a recording session.
          expiresAt: new Date(createdAt.getTime() + MARKER_TTL_MS),
          createdAt,
          updatedAt: createdAt,
        },
      ],
      // Without this Mongoose stamps createdAt = now and every row reads
      // "just now", which loses the staggered "last relief" times.
      { timestamps: false },
    );

    console.log(
      `${drop.villageName.padEnd(14)} ${drop.district.padEnd(10)} ` +
        `${phone}  ${drop.status.padEnd(9)} ${drop.minutesAgo}m ago`,
    );
  }
}

/**
 * Needs, each authored by its own mock Flood-Victim. The role matters: the
 * "People need help" tab reads `/needs/help-requests`, which returns only
 * `createdByRole: "Flood-Victim"` rows.
 */
async function seedMockNeeds(): Promise<void> {
  const now = Date.now();

  for (const need of NEEDS) {
    const phone = `${MOCK_PHONE_PREFIX}${need.phoneSuffix}`;
    const victim = await upsertMockUser(phone, need.name, "Flood-Victim");
    const createdAt = new Date(now - need.minutesAgo * 60_000);

    await NeedModel.create(
      [
        {
          locationName: need.locationName,
          district: need.district,
          items: need.items,
          note: need.note,
          lat: need.lat,
          lng: need.lng,
          createdBy: victim._id,
          providerName: need.name,
          contactPhone: phone,
          createdByRole: "Flood-Victim",
          isResolved: false,
          isDeleted: false,
          createdAt,
          updatedAt: createdAt,
        },
      ],
      // Same reason as the markers: keep the backdated times, so the list
      // reads as requests that came in over the morning.
      { timestamps: false },
    );

    console.log(
      `${need.name.padEnd(18)} ${need.locationName.padEnd(34)} ` +
        `${need.items.join(", ")}`,
    );
  }
}

/** Requirements board posts, authored by the same five Providers as the drops. */
async function seedMockRequirements(): Promise<void> {
  const now = Date.now();

  for (const req of REQUIREMENTS) {
    const drop = DROPS.find((d) => d.phoneSuffix === req.providerSuffix);
    if (!drop) continue;

    const phone = `${MOCK_PHONE_PREFIX}${req.providerSuffix}`;
    const provider = await upsertMockUser(phone, drop.name, "Provider", drop.org);
    const createdAt = new Date(now - req.minutesAgo * 60_000);

    await RequirementModel.create(
      [
        {
          items: req.items,
          message: req.message,
          phoneNumber: phone,
          count: req.count,
          lat: drop.lat,
          lng: drop.lng,
          createdBy: provider._id,
          providerName: drop.name,
          providerOrg: drop.org,
          providerContact: phone,
          status: "open",
          isResolved: false,
          isDeleted: false,
          createdAt,
          updatedAt: createdAt,
        },
      ],
      { timestamps: false },
    );

    console.log(
      `${drop.name.padEnd(18)} ${String(req.count).padStart(4)} people  ` +
        `${req.items.join(", ")}`,
    );
  }
}

async function main() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error(
      `Refusing to run with NODE_ENV="${process.env.NODE_ENV ?? "unset"}" — ` +
        "this seeds fake rescuers and is for local demos only.",
    );
  }

  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is not set in server/.env");

  await mongoose.connect(uri);
  console.log("Mongo DB connected 🐟");

  const clearOnly = process.argv.includes("--clear");

  const cleared = await clearMock();
  console.log(
    `cleared: ${cleared.markers} marker(s), ${cleared.needs} need(s), ` +
      `${cleared.requirements} requirement(s), ${cleared.users} account(s)`,
  );

  if (clearOnly) {
    console.log("\n--clear given — nothing re-seeded.");
    await mongoose.disconnect();
    return;
  }

  console.log("\n=== relief drops — Kathmandu → Nuwakot → Rasuwa ===");
  await seedMock();

  console.log("\n=== people needing help (/provider → People need help) ===");
  await seedMockNeeds();

  console.log("\n=== requirements board (/provider → Requirements board) ===");
  await seedMockRequirements();

  console.log("\n──────── summary ────────");
  console.log(`providers    : ${DROPS.length}`);
  console.log(`victims      : ${NEEDS.length}`);
  console.log(`markers      : ${DROPS.length} (active for 24h from their drop time)`);
  console.log(`needs        : ${NEEDS.length}`);
  console.log(`requirements : ${REQUIREMENTS.length}`);
  console.log("view         : /victim → Rescuers near you");
  console.log("               /provider → People need help / Requirements board");

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Mock seed failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
