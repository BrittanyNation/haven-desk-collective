/* =====================================================================
   server/db.js — database layer + password hashing helpers.
   ---------------------------------------------------------------------
   COURSE NOTES (step 4: Authentication) — the three rules this file
   exists to teach:

   1. NEVER STORE A PASSWORD. Store a HASH: a one-way scramble made
      with crypto.scryptSync(password, salt, 64). "One-way" means you
      can check a guess ("does this guess hash to the stored value?")
      but you can never run it backwards to get the password.
   2. EVERY USER GETS A RANDOM SALT. Without it, two users who both
      chose "garden123" would have identical hashes — and a leaked
      table could be matched against precomputed "rainbow tables".
      With a salt, each hash is unique even for the same password.
   3. COMPARE HASHES WITH timingSafeEqual. A normal === comparison
      stops at the first different byte, and that timing difference
      can leak information. timingSafeEqual always takes the same
      time — it compares the whole thing, every time.

   The demo account below is seeded through the SAME hash function as
   a real sign-up, so signing in as the demo user exercises exactly
   the same code path as any other account.
   ===================================================================== */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = path.join(__dirname, "data", "haven.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));

/* ---- Password helpers (shared by signup, signin, demo seed) ------- */
function hashPassword(password, salt) {
  const useSalt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), useSalt, 64).toString("hex");
  return { salt: useSalt, hash };
}
function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(expectedHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---- Seed spaces — must match FALLBACK_SPACES in ../app.js -------- */
const SEED_SPACES = [
  { id: "solo-focus-pod", name: "Solo Focus Pod", type: "pod", seats: 1, price: 9, rating: 4.9, bookings: 486, blurb: "A quiet, doored pod with a real desk, a lamp you control, and walls that keep the loft hum out.", perks: "Doored pod, desk lamp, power + USB-C, focus timer" },
  { id: "window-desk-4", name: "Window Desk No. 4", type: "desk", seats: 1, price: 11, rating: 4.8, bookings: 392, blurb: "The corner window desk everyone asks for. Morning light, a plantshelf neighbour, and a view of the courtyard.", perks: "Natural light, monitor arm, plant shelf, courtyard view" },
  { id: "duo-desk-bay", name: "Duo Desk Bay", type: "desk", seats: 2, price: 15, rating: 4.7, bookings: 268, blurb: "Two desks face to face with a shared shelf — built for pairs working on the same thing.", perks: "Two desks, shared shelf, whiteboard strip, 2 chairs" },
  { id: "rooftop-terrace-desk", name: "Rooftop Terrace Desk", type: "desk", seats: 2, price: 13, rating: 4.6, bookings: 174, blurb: "A covered outdoor desk for two on the roof terrace. Wi-Fi reaches, the breeze does the rest.", perks: "Covered terrace, outdoor power, Wi-Fi, city view" },
  { id: "maple-meeting-room", name: "Maple Meeting Room", type: "meeting", seats: 6, price: 28, rating: 4.9, bookings: 231, blurb: "Six seats around a maple table, a wall screen for calls, and a door that closes for the conversations that need one.", perks: "Wall screen, video-call camera, whiteboard, doored" },
  { id: "glasshouse-meeting-room", name: "Glasshouse Meeting Room", type: "meeting", seats: 10, price: 42, rating: 4.8, bookings: 158, blurb: "Our biggest room: ten seats, glass walls full of green, and enough table for a full team day.", perks: "Seats 10, wall screen, plants, catering counter" },
  { id: "podcast-studio", name: "Podcast & Call Studio", type: "studio", seats: 4, price: 35, rating: 5.0, bookings: 203, blurb: "Treated walls, two broadcast mics, and a mixer that is already set up. Walk in, press record.", perks: "2 broadcast mics, mixer, treated walls, ring light" },
  { id: "design-studio-bay", name: "Design Studio Bay", type: "studio", seats: 3, price: 24, rating: 4.7, bookings: 141, blurb: "A wide bay for making things: big table, pin wall, daylight lamps, and room to spread a project out.", perks: "Big table, pin wall, daylight lamps, storage crate" }
];

const spaceCount = db.prepare("SELECT COUNT(*) AS n FROM spaces").get().n;
if (spaceCount === 0) {
  const insert = db.prepare(
    "INSERT INTO spaces (id, name, type, seats, price, rating, bookings, blurb, perks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  db.exec("BEGIN");
  try {
    for (const s of SEED_SPACES) insert.run(s.id, s.name, s.type, s.seats, s.price, s.rating, s.bookings, s.blurb, s.perks);
    db.exec("COMMIT");
  } catch (err) { db.exec("ROLLBACK"); throw err; }
  console.log(`Seeded ${SEED_SPACES.length} spaces into ${DB_PATH}`);
}

/* ---- Seed the demo account (through the real hash path) ----------- */
const DEMO = { name: "Maya Rivers (demo)", email: "demo@haven.example", password: "HavenDemo1", plan: "regular" };
const demoRow = db.prepare("SELECT id FROM users WHERE email = ?").get(DEMO.email);
if (!demoRow) {
  const { salt, hash } = hashPassword(DEMO.password);
  db.prepare("INSERT INTO users (name, email, password_hash, salt, plan, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(DEMO.name, DEMO.email, hash, salt, DEMO.plan, new Date().toISOString());
  console.log(`Seeded demo account ${DEMO.email}`);
}

module.exports = { db, DB_PATH, hashPassword, verifyPassword };
