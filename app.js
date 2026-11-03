/* =====================================================================
   app.js — Haven Desk Collective front end.
   ---------------------------------------------------------------------
   COURSE NOTES (step 4: Authentication flow, front-end half)

   HOW AUTH LOOKS FROM THE BROWSER:
   - Sign up / sign in returns { token, user }. We keep the token in
     localStorage ("haven_token") and the user snapshot next to it.
     A token is a BEARER credential: whoever presents it is treated
     as that user, so the site never puts it in a URL, and signing
     out deletes it here AND on the server.
   - Every protected call sends  Authorization: Bearer <token>.
   - On page load we ask the server "who am I?" (GET /api/auth/me).
     If that answers 401, the stored token is stale and we clear it —
     the UI then honestly shows the signed-out state.

   LIVE vs FALLBACK (the pattern from steps 2 and 3):
   GitHub Pages can't run Node, so if the API doesn't answer, this
   file simulates the SAME flow in the browser: accounts live in
   localStorage, passwords are hashed with a small demo hash, and
   sessions are random tokens in localStorage too. READ THIS TWICE:
   client-side "hashing" protects NOTHING — anyone can open the
   browser storage and read it. It exists only so the demo behaves
   like the real thing. The real security lives in server/db.js,
   where scrypt hashing and server-side sessions actually mean it.
   A banner on every page states which mode you are in.
   ===================================================================== */
"use strict";

/* ---- Shared data (must match server/db.js seed) -------------------- */
const FALLBACK_SPACES = [
  { id: "solo-focus-pod", name: "Solo Focus Pod", type: "pod", seats: 1, price: 9, rating: 4.9, bookings: 486, blurb: "A quiet, doored pod with a real desk, a lamp you control, and walls that keep the loft hum out.", perks: "Doored pod, desk lamp, power + USB-C, focus timer" },
  { id: "window-desk-4", name: "Window Desk No. 4", type: "desk", seats: 1, price: 11, rating: 4.8, bookings: 392, blurb: "The corner window desk everyone asks for. Morning light, a plantshelf neighbour, and a view of the courtyard.", perks: "Natural light, monitor arm, plant shelf, courtyard view" },
  { id: "duo-desk-bay", name: "Duo Desk Bay", type: "desk", seats: 2, price: 15, rating: 4.7, bookings: 268, blurb: "Two desks face to face with a shared shelf — built for pairs working on the same thing.", perks: "Two desks, shared shelf, whiteboard strip, 2 chairs" },
  { id: "rooftop-terrace-desk", name: "Rooftop Terrace Desk", type: "desk", seats: 2, price: 13, rating: 4.6, bookings: 174, blurb: "A covered outdoor desk for two on the roof terrace. Wi-Fi reaches, the breeze does the rest.", perks: "Covered terrace, outdoor power, Wi-Fi, city view" },
  { id: "maple-meeting-room", name: "Maple Meeting Room", type: "meeting", seats: 6, price: 28, rating: 4.9, bookings: 231, blurb: "Six seats around a maple table, a wall screen for calls, and a door that closes for the conversations that need one.", perks: "Wall screen, video-call camera, whiteboard, doored" },
  { id: "glasshouse-meeting-room", name: "Glasshouse Meeting Room", type: "meeting", seats: 10, price: 42, rating: 4.8, bookings: 158, blurb: "Our biggest room: ten seats, glass walls full of green, and enough table for a full team day.", perks: "Seats 10, wall screen, plants, catering counter" },
  { id: "podcast-studio", name: "Podcast & Call Studio", type: "studio", seats: 4, price: 35, rating: 5.0, bookings: 203, blurb: "Treated walls, two broadcast mics, and a mixer that is already set up. Walk in, press record.", perks: "2 broadcast mics, mixer, treated walls, ring light" },
  { id: "design-studio-bay", name: "Design Studio Bay", type: "studio", seats: 3, price: 24, rating: 4.7, bookings: 141, blurb: "A wide bay for making things: big table, pin wall, daylight lamps, and room to spread a project out.", perks: "Big table, pin wall, daylight lamps, storage crate" }
];
const PLANS = { payg: { label: "Day Tripper", discount: 0 }, regular: { label: "Regular", discount: 0.15 }, resident: { label: "Resident", discount: 0.25 } };
const EXTRAS = { locker: { label: "Day locker", price: 4 }, monitor: { label: "Extra monitor", price: 6 }, "coffee-pass": { label: "Coffee pass", price: 5 }, "guest-pass": { label: "Guest pass", price: 8 } };
const DEMO = { name: "Maya Rivers (demo)", email: "demo@haven.example", password: "HavenDemo1", plan: "regular" };

/* ---- Tiny helpers --------------------------------------------------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const money = n => "$" + Number(n).toFixed(2).replace(/\.00$/, "");
const todayStr = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const fmtDate = s => new Date(s + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
const fmtHour = h => { const hr = h % 12 === 0 ? 12 : h % 12; return hr + (h < 12 ? " AM" : " PM"); };
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
function slotBookedOut(spaceId, date, hour) { return hashStr(`${spaceId}|${date}|${hour}`) % 5 === 0; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

/* =====================================================================
   THE API LAYER — try the real server first, fall back honestly.
   mode is "live" once any /api call succeeds, "fallback" otherwise.
   ===================================================================== */
let MODE = "unknown";
async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = localStorage.getItem("haven_token");
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(path, { ...options, headers });
  /* A static host (GitHub Pages) answers /api/* with an HTML error
     page. Only a JSON response proves our server is really there —
     anything else means "no server", and callers fall back. */
  const ct = (res.headers.get("content-type") || "");
  if (!ct.includes("application/json")) throw new Error("no api server");
  MODE = "live";
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  return { ok: res.ok, status: res.status, data };
}
function setBanner() {
  const el = $("#modeBanner");
  if (!el) return;
  if (MODE === "live") el.innerHTML = "<strong>Live mode:</strong> connected to the Haven Node + Express + SQLite server — accounts and bookings are stored in the real database.";
  else if (MODE === "fallback") el.innerHTML = "<strong>Demo mode on GitHub Pages:</strong> no server runs here, so accounts and bookings are simulated in your browser (localStorage) with the same rules. Run the code in <strong>/server</strong> locally for the real authenticated version.";
}

/* ---- Fallback auth store (DEMO ONLY — see the header warning) ------ */
function demoHash(pw, salt) { return "d" + hashStr(salt + "::" + pw).toString(16) + hashStr(pw + "::" + salt).toString(16); }
function fbUsers() {
  let users = JSON.parse(localStorage.getItem("haven_fb_users") || "null");
  if (!users) {
    const salt = "demo-salt";
    users = [{ id: 1, name: DEMO.name, email: DEMO.email, salt, hash: demoHash(DEMO.password, salt), plan: DEMO.plan, createdAt: new Date().toISOString() }];
    localStorage.setItem("haven_fb_users", JSON.stringify(users));
  }
  return users;
}
function fbSaveUsers(u) { localStorage.setItem("haven_fb_users", JSON.stringify(u)); }
function publicUser(u) { return { id: u.id, name: u.name, email: u.email, plan: u.plan, planLabel: PLANS[u.plan].label, discount: PLANS[u.plan].discount, createdAt: u.createdAt || u.created_at }; }
function fbStartSession(userId) {
  const token = "fb-" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const sessions = JSON.parse(localStorage.getItem("haven_fb_sessions") || "{}");
  sessions[token] = { userId, expires: Date.now() + 7 * 86400000 };
  localStorage.setItem("haven_fb_sessions", JSON.stringify(sessions));
  return token;
}
function fbCurrentUser() {
  const token = localStorage.getItem("haven_token");
  if (!token) return null;
  const sessions = JSON.parse(localStorage.getItem("haven_fb_sessions") || "{}");
  const s = sessions[token];
  if (!s || s.expires < Date.now()) return null;
  return fbUsers().find(u => u.id === s.userId) || null;
}
const passwordErrors = pw => {
  const errs = [];
  if (!pw || pw.length < 8) errs.push("Password must be at least 8 characters.");
  if (!/[A-Za-z]/.test(pw || "")) errs.push("Password needs at least one letter.");
  if (!/\d/.test(pw || "")) errs.push("Password needs at least one number.");
  return errs;
};
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());

/* ---- Auth actions: same shape in both modes ------------------------ */
const Auth = {
  user: null,
  async restore() {
    const token = localStorage.getItem("haven_token");
    if (!token) { this.user = null; return null; }
    try {
      const r = await api("/api/auth/me");
      if (r.ok) { this.user = r.data.user; localStorage.setItem("haven_user", JSON.stringify(this.user)); return this.user; }
      if (r.status === 401 && MODE === "live") { this.clearLocal(); return null; }
      throw new Error("no server");
    } catch {
      MODE = "fallback";
      const u = fbCurrentUser();
      this.user = u ? publicUser(u) : null;
      if (!this.user) this.clearLocal(); else localStorage.setItem("haven_user", JSON.stringify(this.user));
      return this.user;
    }
  },
  clearLocal() { localStorage.removeItem("haven_token"); localStorage.removeItem("haven_user"); this.user = null; },
  async signup({ name, email, password, confirm, plan }) {
    try {
      const r = await api("/api/auth/signup", { method: "POST", body: JSON.stringify({ name, email, password, confirm, plan }) });
      if (r.ok) { localStorage.setItem("haven_token", r.data.token); this.user = r.data.user; localStorage.setItem("haven_user", JSON.stringify(this.user)); return { ok: true }; }
      if (MODE === "live") return { ok: false, errors: r.data.errors || ["Sign up failed."] };
      throw new Error("no server");
    } catch {
      MODE = "fallback";
      const errors = [];
      if (!name.trim()) errors.push("Name is required.");
      if (!emailOk(email)) errors.push("A valid email is required.");
      errors.push(...passwordErrors(password));
      if (password !== confirm) errors.push("Passwords do not match.");
      if (errors.length) return { ok: false, errors };
      const users = fbUsers();
      const em = email.trim().toLowerCase();
      if (users.some(u => u.email.toLowerCase() === em)) return { ok: false, errors: ["An account with that email already exists — try signing in."] };
      const salt = Math.random().toString(36).slice(2, 10);
      const user = { id: Date.now(), name: name.trim(), email: em, salt, hash: demoHash(password, salt), plan: PLANS[plan] ? plan : "payg", createdAt: new Date().toISOString() };
      users.push(user); fbSaveUsers(users);
      localStorage.setItem("haven_token", fbStartSession(user.id));
      this.user = publicUser(user); localStorage.setItem("haven_user", JSON.stringify(this.user));
      return { ok: true };
    }
  },
  async signin({ email, password }) {
    try {
      const r = await api("/api/auth/signin", { method: "POST", body: JSON.stringify({ email, password }) });
      if (r.ok) { localStorage.setItem("haven_token", r.data.token); this.user = r.data.user; localStorage.setItem("haven_user", JSON.stringify(this.user)); return { ok: true }; }
      if (MODE === "live") return { ok: false, errors: r.data.errors || ["Sign in failed."] };
      throw new Error("no server");
    } catch {
      MODE = "fallback";
      const user = fbUsers().find(u => u.email.toLowerCase() === String(email).trim().toLowerCase());
      if (!user || user.hash !== demoHash(password, user.salt)) return { ok: false, errors: ["Email or password does not match our records."] };
      localStorage.setItem("haven_token", fbStartSession(user.id));
      this.user = publicUser(user); localStorage.setItem("haven_user", JSON.stringify(this.user));
      return { ok: true };
    }
  },
  async signout() {
    try { if (MODE === "live") await api("/api/auth/signout", { method: "POST" }); } catch { /* already gone */ }
    const token = localStorage.getItem("haven_token");
    const sessions = JSON.parse(localStorage.getItem("haven_fb_sessions") || "{}");
    if (token && sessions[token]) { delete sessions[token]; localStorage.setItem("haven_fb_sessions", JSON.stringify(sessions)); }
    this.clearLocal();
  },
  async changePassword({ current, next, confirm }) {
    try {
      const r = await api("/api/auth/password", { method: "POST", body: JSON.stringify({ current, next, confirm }) });
      if (r.ok) return { ok: true };
      if (MODE === "live") return { ok: false, errors: r.data.errors || ["Could not change password."] };
      throw new Error("no server");
    } catch {
      MODE = "fallback";
      const u = fbCurrentUser();
      if (!u) return { ok: false, errors: ["Sign in required."] };
      if (u.hash !== demoHash(current, u.salt)) return { ok: false, errors: ["Current password is not correct."] };
      const errors = passwordErrors(next);
      if (next !== confirm) errors.push("New passwords do not match.");
      if (errors.length) return { ok: false, errors };
      const users = fbUsers(); const row = users.find(x => x.id === u.id);
      row.salt = Math.random().toString(36).slice(2, 10); row.hash = demoHash(next, row.salt); fbSaveUsers(users);
      return { ok: true };
    }
  }
};

/* ---- Bookings ------------------------------------------------------- */
function fbBookings() { return JSON.parse(localStorage.getItem("haven_fb_bookings") || "[]"); }
function priceFor(pricePerHour, hours, extras, discount) {
  const gross = hours * pricePerHour + extras.reduce((s, x) => s + (EXTRAS[x] ? EXTRAS[x].price : 0), 0);
  return Math.round(gross * (1 - discount) * 1.07 * 100) / 100;
}
const Bookings = {
  async create(payload) {
    try {
      const r = await api("/api/bookings", { method: "POST", body: JSON.stringify(payload) });
      if (r.ok || MODE === "live") return { ok: r.ok, status: r.status, data: r.data, errors: r.data.errors || (r.ok ? [] : [r.data.error || "Booking failed."]) };
      throw new Error("no server");
    } catch {
      MODE = "fallback";
      const u = fbCurrentUser();
      if (!u) return { ok: false, status: 401, errors: ["Sign in required."] };
      const space = FALLBACK_SPACES.find(s => s.id === payload.spaceId);
      if (!space) return { ok: false, errors: ["Unknown space."] };
      const all = fbBookings();
      const clash = all.some(bk => bk.space_id === space.id && bk.date === payload.date && bk.status === "active" && !(payload.startHour + payload.hours <= bk.start_hour || payload.startHour >= bk.start_hour + bk.hours));
      if (clash) return { ok: false, errors: ["That space is already booked for part of that time."] };
      for (let h = payload.startHour; h < payload.startHour + payload.hours; h++) if (slotBookedOut(space.id, payload.date, h)) return { ok: false, errors: ["That start time is already booked out."] };
      const booking = { ref: "HD-" + Math.random().toString(16).slice(2, 8).toUpperCase(), space_id: space.id, space_name: space.name, user_id: u.id, date: payload.date, start_hour: payload.startHour, hours: payload.hours, extras: payload.extras || [], total: priceFor(space.price, payload.hours, payload.extras || [], PLANS[u.plan].discount), status: "active", created_at: new Date().toISOString() };
      all.unshift(booking); localStorage.setItem("haven_fb_bookings", JSON.stringify(all));
      return { ok: true, status: 201, data: booking };
    }
  },
  async mine() {
    try {
      const r = await api("/api/bookings/mine");
      if (r.ok) return r.data.bookings;
      if (MODE === "live") return [];
      throw new Error("no server");
    } catch {
      MODE = "fallback";
      const u = fbCurrentUser(); if (!u) return [];
      return fbBookings().filter(b => b.user_id === u.id);
    }
  },
  async cancel(ref) {
    try {
      const r = await api("/api/bookings/" + encodeURIComponent(ref), { method: "DELETE" });
      if (r.ok || MODE === "live") return { ok: r.ok, errors: r.ok ? [] : [r.data.error || "Cancel failed."] };
      throw new Error("no server");
    } catch {
      MODE = "fallback";
      const all = fbBookings(); const bk = all.find(b => b.ref === ref);
      if (!bk) return { ok: false, errors: ["No booking with that reference."] };
      bk.status = "cancelled"; localStorage.setItem("haven_fb_bookings", JSON.stringify(all));
      return { ok: true };
    }
  },
  async bookedOut(spaceId, date) {
    try {
      const r = await api(`/api/availability?spaceId=${encodeURIComponent(spaceId)}&date=${encodeURIComponent(date)}`);
      if (r.ok) return new Set(r.data.bookedOut);
      throw new Error("no server");
    } catch {
      MODE = MODE === "live" ? MODE : "fallback";
      const taken = new Set();
      for (let h = 8; h <= 17; h++) if (slotBookedOut(spaceId, date, h)) taken.add(h);
      for (const bk of fbBookings()) if (bk.space_id === spaceId && bk.date === date && bk.status === "active") for (let h = bk.start_hour; h < bk.start_hour + bk.hours; h++) taken.add(h);
      return taken;
    }
  }
};

/* ---- Favorites (saved spaces) — per account, on this device -------- */
function favorites() {
  if (!Auth.user) return [];
  const all = JSON.parse(localStorage.getItem("haven_favorites") || "{}");
  return all[Auth.user.email] || [];
}
function toggleFavorite(spaceId) {
  const all = JSON.parse(localStorage.getItem("haven_favorites") || "{}");
  const list = all[Auth.user.email] || [];
  const i = list.indexOf(spaceId);
  if (i >= 0) list.splice(i, 1); else list.push(spaceId);
  all[Auth.user.email] = list; localStorage.setItem("haven_favorites", JSON.stringify(all));
  return list;
}

/* ---- Header auth state ---------------------------------------------- */
function renderAuthNav() {
  const slot = $("#authNav");
  if (!slot) return;
  if (Auth.user) slot.innerHTML = `<a href="account.html" aria-current="${location.pathname.endsWith("account.html") ? "page" : "false"}">Hi, ${escapeHtml(Auth.user.name.split(" ")[0])} · Dashboard</a> <a href="#" id="navSignOut">Sign out</a>`;
  else slot.innerHTML = `<a href="account.html">Sign in</a> <a href="account.html#signup" class="btn small">Create account</a>`;
  const out = $("#navSignOut");
  if (out) out.addEventListener("click", async e => { e.preventDefault(); await Auth.signout(); location.href = "index.html"; });
}

/* ---- Boot: restore session, paint banner + nav --------------------- */
document.addEventListener("DOMContentLoaded", async () => {
  await Auth.restore();
  if (MODE === "unknown") MODE = "fallback";
  setBanner();
  renderAuthNav();
  if (window.pageInit) window.pageInit();
});
