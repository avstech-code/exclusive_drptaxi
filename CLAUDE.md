# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

247droptaxi / droptaxi.com: a one-way drop-taxi site for Tamil Nadu, Puducherry and Bangalore (SEO route pages such as `/chennai-to-coimbatore-taxi`, and a booking flow). It is a Vercel-deployable rewrite of the sibling project `D:\Project cab` (Angular + Spring Boot + MySQL), which is kept untouched as the reference. API URLs and JSON shapes were kept identical to the old backend, and `src/app/globals.css` is the old stylesheet with element selectors turned into classes. Next.js 15 (App Router, React 19, TypeScript, no Tailwind), Postgres. Live at https://www.247droptaxi.com, deployed by Vercel from the `main` branch of github.com/vigneshkmr22/247droptaxi (a push deploys).

## Commands

- `npm run dev` runs on :3000. `npm run build` / `npm start` for production. There is no lint script and no tests; the check is `npx tsc --noEmit` plus `npm run build`.
- `npm run seed` creates tables and fills empty ones from `data/*.json`; `npm run seed:reset` drops everything first (deletes bookings).
- On this Windows machine PowerShell blocks `npm.ps1`: use `npm.cmd ...` (or run from Git Bash).
- Without `DATABASE_URL` (or `POSTGRES_URL`) the app uses PGlite, an embedded Postgres in `.data/pglite` (gitignored), so local work needs no account. Run `npm run seed` once first. Only one process can open that directory at a time, so stop the dev server before running the seed script against it.
- `.env.local` holds local values only (`NEXT_PUBLIC_SITE_URL`, `GOOGLE_MAPS_API_KEY`). Do not run `vercel env pull` into it: Vercel treats the database variables as sensitive and writes the literal `[SENSITIVE]`, which makes `neon()` throw "not a valid URL".

## Architecture

- **Server logic lives in `src/lib`, and both pages and API routes call it directly.** Server components (home, route, city, tariff, FAQ pages) import `catalog.ts` / `trips.ts` instead of fetching `/api`. Browser code (`HomeClient`, `BookingForm`, `PlaceInput`) uses `lib/api-client.ts` against `src/app/api/**`. Files under `src/lib` that touch the database or secrets start with `import 'server-only'`; `types.ts`, `fare.ts`, `format.ts` and `city-theme.ts` are shared with the browser, so keep them free of server imports.
- **API routes** are thin: `api()` in `lib/http.ts` wraps a handler, turns `ApiError(status, message)` into `{message}` JSON and handles Next 15's async `params`. `rateLimit()` is an in-memory per-instance limiter, so it is only a soft limit on Vercel.
- **Database access** is `query()` / `one()` in `lib/db.ts`: parameterised `$1` SQL, rows returned directly. The Neon HTTP driver takes one statement per call and has no interactive transactions, so write each operation as a single statement. `NUMERIC` comes back as text, so selects cast with `::float8`, and dates and times with `::text` (see `BOOKING_SELECT`).
- **Pricing** (`lib/fare.ts`) is pure and recomputed on the server for every quote and booking; the client never sends a price. One way: `max(km, minKm) x rate + driver batta`. Round trip: `max(2 x km, 250 x calendar days)` at the vehicle's own round-trip rate and batta. Package: package km x rate + hourly charge. GST is added only while the `gst_enabled` setting is on. Tolls and permits are never in a total (extra as per actuals). Fixed numbers (min km, GST rate, packages, road-distance factor) are in `lib/config.ts`; per-vehicle rates are in the `vehicle_types` table and changed by editing the database directly (Neon).
- **Distances** (`lib/trips.ts`): between two Google places, a stored route is used when both are within 15 km of cities that have one, otherwise Google Routes road distance. Between two dropdown cities, the stored `routes` row, else Google (cached 24 h per pair), else a straight-line estimate times 1.25 flagged `ESTIMATE`. `routePage()` serves a page for any city pair, not only stored routes. Google (`lib/google.ts`) is server-side only; without `GOOGLE_MAPS_API_KEY` or with the `places_enabled` setting off, `/api/places/config` returns `enabled:false` and the home page falls back to city dropdowns.
- **Settings and caching**: switches and phone numbers are rows in `app_settings` (`lib/settings.ts`). Vehicles, settings and active cities are cached 15 s per instance in `lib/cache.ts`; code that writes them must call `clearCaches()`.
- **Bookings** are one `bookings` table with a `trip_type` column (the old backend used three tables). `createBooking` accepts exactly one of `routeSlug`, place ids, or city slugs, and emails the owner via Resend (`lib/notify.ts`) in `after()` when `RESEND_API_KEY` and `BOOKING_ALERT_EMAIL` are set. Staff edits (`updateBooking`) take a typed total and do not recompute it.
- **Photos**: a stored `file_name` / `image_file` is a bundled file under `public/media/{cities,vehicles}` (plain name) or a full URL; `mediaUrl()` in `types.ts` handles both. There is no upload screen, so add photos by committing files to `public/media`.
- **Pages read live data**, so `app/layout.tsx` sets `dynamic = 'force-dynamic'` and nothing touches the database at build time. `app/[slug]/page.tsx` only accepts `*-to-*-taxi` slugs (anything else is a 404); static folders take precedence over it.

## Data and deployment

- Starting data is `data/*.json`, exported from the old MySQL database (86 cities, 244 routes, 5 vehicles, FAQs, settings). `data/vehicles.json` names the car photos in `public/media/vehicles`.
- **`src/lib/schema-sql.ts` is a copy of `db/schema.sql`** (embedded so a route can run it). Change both together.
- There is no admin area. Seed production once from a PC with `DATABASE_URL="<neon url>" npm run seed` (fills empty tables only, never overwrites rows). Change rates, settings or content by editing the database in Neon.
- Vercel needs: `DATABASE_URL` (Neon, added from Storage), `NEXT_PUBLIC_SITE_URL`, and optionally `GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_BUSINESS_ADDRESS`, `RESEND_API_KEY`, `BOOKING_ALERT_EMAIL`. Changing an environment variable only takes effect after a redeploy. `vercel.json` pins functions to `sin1`, which should match the Neon region.
- `cab/` (gitignored) only holds the original car photos; the app serves the copies in `public/media/vehicles`.
- Policy, about and service text in `src/lib/content.ts` is placeholder wording.
- Git has no global identity on this machine; commit with `git -c user.name=... -c user.email=...` or set one first.
