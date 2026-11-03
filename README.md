# Haven Desk Collective — Coworking Loft with a Members Door

**Live site (front end):** https://brittanynation.github.io/haven-desk-collective/

A fully functional website for **Haven Desk Collective**, a fictional neighborhood coworking loft: browse 8 desks, pods, meeting rooms and studios with search, filters and favorites — then pass the members door. Creating an account, signing in, and managing a session all work end to end, and **booking is members-only**: guests can look, only signed-in members can reserve, and every member sees only their own bookings. Every interactive element works — no dead buttons, no placeholder links.

This is an original portfolio concept by Brittany Nation. No affiliation with any real business is claimed. Design workflow: Sketch / Webflow for layout thinking, built by hand in HTML, CSS and JavaScript, with a real Node.js back end in `/server`.

## Course-track step 4: Authentication flow

This is the **fourth course-track project** in the portfolio, built alongside Dr. Angela Yu's *Full-Stack Web Development Bootcamp* (Udemy). Step 1 was live APIs + async JavaScript ([Solstice Skies](https://github.com/BrittanyNation/solstice-skies)); step 2 was Node.js + Express ([Willow Bend Paddle Co.](https://github.com/BrittanyNation/willow-bend-paddle)); step 3 was databases + REST API design ([Tinker Commons](https://github.com/BrittanyNation/tinker-commons)). This step adds **authentication**, the whole flow commented as study code:

- **Sign up** — validated name/email/password (8+ characters, letter + number), plan choice, duplicate-email rejection (409).
- **Password hashing** (`server/db.js`) — passwords are never stored. Each user gets a random **salt**, and the stored value is a **scrypt hash** (`crypto.scryptSync`); checks use `crypto.timingSafeEqual`. Two users with the same password have different hashes.
- **Sessions** — sign-up/sign-in returns a random 32-byte **token**; the server stores it in a `sessions` table with a 7-day expiry. The browser sends it as `Authorization: Bearer <token>`.
- **Protected routes** — one `requireAuth` middleware gates every booking route. Missing, unknown or expired token → `401`. Cancelling someone else's booking → `403`. Wrong email and wrong password return the *same* message, so the API never reveals which emails have accounts.
- **Sign out** — deletes the session row server-side; the old token stops working immediately (verified).
- **Password change** — verifies the current password, re-hashes, and ends the account's other sessions.
- **API** (`server/server.js`): `POST /api/auth/signup` · `POST /api/auth/signin` · `GET /api/auth/me` · `POST /api/auth/signout` · `POST /api/auth/password` · `GET /api/spaces` · `GET /api/spaces/:id` · `GET /api/availability` · `POST /api/bookings` (auth) · `GET /api/bookings/mine` (auth) · `DELETE /api/bookings/:ref` (auth, owner only) · `GET /api/stats`. Data lives in SQLite (users, sessions, spaces, bookings) and survives restarts — verified.

**Try the demo account:** `demo@haven.example` / `HavenDemo1` (Regular plan).

### Run the full-stack version locally

```bash
cd server
npm install   # downloads Express, once
npm start     # or: node server.js
```

Open http://localhost:3000 — the banner on the site will say **Live mode**, accounts and bookings save into `server/data/haven.db`, and deleting that file resets the loft (the demo account re-seeds itself).

### What is live vs local — honestly

GitHub Pages hosts static files only: it cannot run Node. The published demo therefore simulates the *same* flow in the browser — accounts, tokens and bookings in localStorage, with identical validation, pricing and rules — and a banner on every page says which mode you are in. One honesty note, stated in the code too: **client-side password "hashing" in the demo protects nothing**; it only makes the demo behave like the real thing. The real security is the server's scrypt hashing and server-side sessions, in `/server`.

## What works on the site

- **Home** — live stats (spaces, member accounts, bookings), most-loved spaces from the data, plan table, working FAQ accordions, and a validated newsletter signup that recognises repeat subscribers.
- **Spaces & pricing** — 8 spaces rendered from data; type chips, live search, four sort orders, result count and an honest empty state; a details modal; per-account favorite hearts (guests are routed through the members door and their intent is remembered).
- **Auth** — sign-in/sign-up tabs, show-password toggle, live password-strength meter, inline field errors, server error states (duplicate email, wrong credentials with one safe message), demo-account filler; sessions persist across pages and reloads for 7 days; signing out works from the header and the dashboard.
- **Booking (members only)** — guests who tap Book are sent to sign in and returned to the same space afterwards. Date-driven start-time slots (about 1 in 5 honestly booked out, plus real bookings block their hours), 1–4 hour durations that must end by the 6 PM close, Sunday-closed and past-date validation, flat extras, the member's plan saving (Regular 15% / Resident 25%) and 7% tax as separate summary lines, a confirmation with a generated `HD-XXXXXX` reference, and persistence (SQLite in live mode, localStorage on Pages).
- **Dashboard** — member stats (active bookings, hours, saved spaces, plan), booking list with one-click cancel (owner-only, enforced server-side), saved spaces, account details, password change, and sign out.

## Verified

Server tested end to end locally (20 checks: signup 201, duplicate 409, weak password 400, wrong password 401 with the generic message, demo sign-in, `/me` with/without token, booking without token 401, booking total math `(2h × $9 + $6 monitor) × 0.75 Resident × 1.07 tax = $19.26`, overlap clash, Sunday rejection, other-member cancel 403, owner cancel 200, password change wrong/right, old password dead after change, sign-out invalidating the token, accounts and bookings persisting across a server restart). The front end passed 44 automated DOM checks of the fallback flow (filters, search, sort, modal, auth validation incl. duplicate email and the generic wrong-password message, strength meter, gated booking with return-to-space intent, $21.83 Regular-plan summary math, confirmation + persistence, dashboard stats, cancel, password change, sign-out clearing the token).

## Palette

Indigo `#232946`, studio violet `#6C5CE7`, lavender mist `#D6D1F5`, mint `#43C6A0`, butter `#FFC857`, paper `#F9F8FD`.

## Pages

- `index.html` — home: stats, how it works, featured spaces, plans, FAQs, newsletter
- `spaces.html` — the 8 spaces, filters/search/sort, details, favorites, booking flow + summary
- `account.html` — sign in / create account, and the member dashboard (bookings, saved spaces, password change)
- `server/` — the real authenticated back end (Express + SQLite), commented as study code
