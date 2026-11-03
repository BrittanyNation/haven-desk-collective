/* =====================================================================
   server/server.js — REST API with AUTHENTICATION.
   ---------------------------------------------------------------------
   COURSE NOTES (Full-Stack Bootcamp, step 4: Authentication flow)

   THE FLOW, start to finish:
     1. SIGN UP   POST /api/auth/signup  — validate, hash the password
                  (see db.js), insert the user, start a session.
     2. SESSION   The server makes a random token, stores it in the
                  sessions table with an expiry, and returns it once.
                  The browser keeps the token and sends it on every
                  later request as:  Authorization: Bearer <token>
     3. PROTECTED ROUTES check the token first (requireAuth below).
                  No token / unknown token / expired token -> 401.
                  That single middleware is the whole gate: bookings
                  can only be created, read, or cancelled by the
                  signed-in owner.
     4. SIGN IN   POST /api/auth/signin  — look the user up by email,
                  verify the guess against the stored hash, and start
                  a FRESH session (old ones are left to expire).
                  Wrong email and wrong password return the SAME
                  message, so the API never reveals which emails
                  have accounts.
     5. SIGN OUT  POST /api/auth/signout — delete the session row.
                  The token the browser still holds is now worthless.

   Run it:
     cd server && npm install && npm start
   Then open http://localhost:3000 — the banner will say "Live mode".
   GitHub Pages cannot run Node, so the published demo simulates the
   same flow in the browser (see ../app.js) and says so honestly.
   ===================================================================== */

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { db, hashPassword, verifyPassword } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_DAYS = 7;

app.use(express.json());
app.use(express.static(path.join(__dirname, "..")));

/* ---- Shared rules (the front end mirrors these exactly) ----------- */
const PLANS = { payg: { label: "Day Tripper", discount: 0 }, regular: { label: "Regular", discount: 0.15 }, resident: { label: "Resident", discount: 0.25 } };
const EXTRAS = { locker: 4, monitor: 6, "coffee-pass": 5, "guest-pass": 8 };
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());
const passwordErrors = pw => {
  const errs = [];
  if (!pw || String(pw).length < 8) errs.push("Password must be at least 8 characters.");
  if (!/[A-Za-z]/.test(pw || "")) errs.push("Password needs at least one letter.");
  if (!/\d/.test(pw || "")) errs.push("Password needs at least one number.");
  return errs;
};
/* Deterministic "already booked" start hours (~1 in 5), shared with
   the front end so live and fallback modes agree. Real bookings in
   the database block their hours on top of this. */
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
function slotBookedOut(spaceId, date, hour) { return hashStr(`${spaceId}|${date}|${hour}`) % 5 === 0; }

function publicUser(row) {
  /* NEVER send the hash or salt to the client — this shape is all
     the browser ever sees of a user. */
  return { id: row.id, name: row.name, email: row.email, plan: row.plan, planLabel: PLANS[row.plan].label, discount: PLANS[row.plan].discount, createdAt: row.created_at };
}
function startSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400000);
  db.prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(token, userId, now.toISOString(), expires.toISOString());
  return token;
}
/* The gate. Reads the Bearer token, loads its session + user, and
   either attaches req.user and continues, or answers 401. */
function requireAuth(req, res, next) {
  const header = req.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Sign in required." });
  const session = db.prepare("SELECT * FROM sessions WHERE token = ?").get(token);
  if (!session) return res.status(401).json({ error: "Session not recognised — please sign in again." });
  if (new Date(session.expires_at) < new Date()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return res.status(401).json({ error: "Session expired — please sign in again." });
  }
  req.user = db.prepare("SELECT * FROM users WHERE id = ?").get(session.user_id);
  req.token = token;
  next();
}

/* ---- Auth routes --------------------------------------------------- */
app.post("/api/auth/signup", (req, res) => {
  const b = req.body || {};
  const errors = [];
  if (!b.name || !String(b.name).trim()) errors.push("Name is required.");
  if (!emailOk(b.email)) errors.push("A valid email is required.");
  errors.push(...passwordErrors(b.password));
  if (b.password !== b.confirm) errors.push("Passwords do not match.");
  const plan = PLANS[b.plan] ? b.plan : "payg";
  if (errors.length) return res.status(400).json({ errors });
  const email = String(b.email).trim().toLowerCase();
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) {
    return res.status(409).json({ errors: ["An account with that email already exists — try signing in."] });
  }
  const { salt, hash } = hashPassword(b.password);
  const info = db.prepare("INSERT INTO users (name, email, password_hash, salt, plan, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(String(b.name).trim(), email, hash, salt, plan, new Date().toISOString());
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ token: startSession(user.id), user: publicUser(user) });
});

app.post("/api/auth/signin", (req, res) => {
  const b = req.body || {};
  const email = String(b.email || "").trim().toLowerCase();
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  /* One message for both failures — never reveal which part was wrong. */
  if (!user || !verifyPassword(b.password || "", user.salt, user.password_hash)) {
    return res.status(401).json({ errors: ["Email or password does not match our records."] });
  }
  res.json({ token: startSession(user.id), user: publicUser(user) });
});

app.get("/api/auth/me", requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

app.post("/api/auth/signout", requireAuth, (req, res) => {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(req.token);
  res.json({ ok: true });
});

app.post("/api/auth/password", requireAuth, (req, res) => {
  const b = req.body || {};
  if (!verifyPassword(b.current || "", req.user.salt, req.user.password_hash)) {
    return res.status(400).json({ errors: ["Current password is not correct."] });
  }
  const errors = passwordErrors(b.next);
  if (b.next !== b.confirm) errors.push("New passwords do not match.");
  if (errors.length) return res.status(400).json({ errors });
  const { salt, hash } = hashPassword(b.next);
  db.prepare("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?").run(hash, salt, req.user.id);
  /* Changing the password ends every OTHER session for safety. */
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").run(req.user.id, req.token);
  res.json({ ok: true });
});

/* ---- Spaces -------------------------------------------------------- */
function spaceRowToApi(r) { return { id: r.id, name: r.name, type: r.type, seats: r.seats, price: r.price, rating: r.rating, bookings: r.bookings, blurb: r.blurb, perks: r.perks }; }
app.get("/api/spaces", (req, res) => {
  const { type, q } = req.query;
  let rows = db.prepare("SELECT * FROM spaces ORDER BY bookings DESC").all();
  if (type && type !== "all") rows = rows.filter(r => r.type === type);
  if (q) { const n = String(q).toLowerCase(); rows = rows.filter(r => (r.name + " " + r.blurb + " " + r.type).toLowerCase().includes(n)); }
  res.json({ spaces: rows.map(spaceRowToApi) });
});
app.get("/api/spaces/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM spaces WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "No space with that id." });
  res.json(spaceRowToApi(row));
});
app.get("/api/availability", (req, res) => {
  const { spaceId, date } = req.query;
  if (!spaceId || !date) return res.status(400).json({ error: "Give me ?spaceId= and ?date=." });
  const taken = new Set();
  for (let h = 8; h <= 17; h++) if (slotBookedOut(spaceId, date, h)) taken.add(h);
  const rows = db.prepare("SELECT start_hour, hours FROM bookings WHERE space_id = ? AND date = ? AND status = 'active'").all(spaceId, date);
  for (const r of rows) for (let h = r.start_hour; h < r.start_hour + r.hours; h++) taken.add(h);
  res.json({ date, bookedOut: [...taken].sort((a, b) => a - b) });
});

/* ---- Bookings (all protected — this is the point of step 4) ------- */
app.post("/api/bookings", requireAuth, (req, res) => {
  const b = req.body || {};
  const errors = [];
  const space = db.prepare("SELECT * FROM spaces WHERE id = ?").get(b.spaceId || "");
  if (!space) errors.push("Unknown spaceId.");
  const dateOk = s => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
  if (!dateOk(b.date)) errors.push("Date must be YYYY-MM-DD.");
  const start = Number(b.startHour), hours = Number(b.hours);
  if (!Number.isInteger(start) || start < 8 || start > 17) errors.push("Start time must be between 8 AM and 5 PM.");
  if (!Number.isInteger(hours) || hours < 1 || hours > 4) errors.push("Bookings run 1 to 4 hours.");
  if (Number.isInteger(start) && Number.isInteger(hours) && start + hours > 18) errors.push("Bookings must end by 6 PM.");
  if (dateOk(b.date)) {
    const d = new Date(b.date + "T12:00:00");
    if (d.getDay() === 0) errors.push("Closed on Sundays — pick another day.");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (d < today) errors.push("Date cannot be in the past.");
    if (space && Number.isInteger(start) && Number.isInteger(hours)) {
      for (let h = start; h < start + hours; h++) {
        if (slotBookedOut(space.id, b.date, h)) { errors.push("That start time is already booked out."); break; }
      }
      const clash = db.prepare("SELECT ref FROM bookings WHERE space_id = ? AND date = ? AND status = 'active' AND NOT (? + ? <= start_hour OR ? >= start_hour + hours)").get(space.id, b.date, start, hours, start);
      if (clash) errors.push("That space is already booked for part of that time.");
    }
  }
  const extras = Array.isArray(b.extras) ? b.extras.filter(x => EXTRAS[x] !== undefined) : [];
  if (errors.length) return res.status(400).json({ errors });
  const gross = hours * space.price + extras.reduce((s, x) => s + EXTRAS[x], 0);
  const discounted = gross * (1 - PLANS[req.user.plan].discount);
  const total = Math.round(discounted * 1.07 * 100) / 100;
  const booking = {
    ref: "HD-" + crypto.randomBytes(3).toString("hex").toUpperCase(),
    space_id: space.id, space_name: space.name, user_id: req.user.id,
    date: b.date, start_hour: start, hours, extras: JSON.stringify(extras),
    total, status: "active", created_at: new Date().toISOString()
  };
  db.prepare("INSERT INTO bookings (ref, space_id, space_name, user_id, date, start_hour, hours, extras, total, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(booking.ref, booking.space_id, booking.space_name, booking.user_id, booking.date, booking.start_hour, booking.hours, booking.extras, booking.total, booking.status, booking.created_at);
  db.prepare("UPDATE spaces SET bookings = bookings + 1 WHERE id = ?").run(space.id);
  res.status(201).json({ ...booking, extras });
});

app.get("/api/bookings/mine", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM bookings WHERE user_id = ? ORDER BY created_at DESC").all(req.user.id);
  res.json({ bookings: rows.map(r => ({ ...r, extras: JSON.parse(r.extras || "[]") })) });
});

app.delete("/api/bookings/:ref", requireAuth, (req, res) => {
  const row = db.prepare("SELECT * FROM bookings WHERE ref = ?").get(req.params.ref.toUpperCase());
  if (!row) return res.status(404).json({ error: "No booking with that reference." });
  if (row.user_id !== req.user.id) return res.status(403).json({ error: "That booking belongs to a different account." });
  if (row.status === "cancelled") return res.status(400).json({ error: "That booking is already cancelled." });
  db.prepare("UPDATE bookings SET status = 'cancelled' WHERE ref = ?").run(row.ref);
  res.json({ ref: row.ref, status: "cancelled" });
});

app.get("/api/stats", (req, res) => {
  const spaces = db.prepare("SELECT COUNT(*) AS n FROM spaces").get().n;
  const members = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  const bookings = db.prepare("SELECT COALESCE(SUM(bookings),0) AS n FROM spaces").get().n;
  res.json({ spaces, members, bookings });
});

app.use("/api", (req, res) => res.status(404).json({ error: "Unknown API route." }));
app.listen(PORT, () => {
  console.log(`Haven Desk Collective server running at http://localhost:${PORT}`);
  console.log(`Demo account: demo@haven.example / HavenDemo1`);
});
