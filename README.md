# droptaxi (Vercel edition)

The same one-way drop-taxi site as `D:\Project cab`, rebuilt so the whole thing runs on Vercel:

| Old project | This project |
| --- | --- |
| Angular 18 + Express SSR | Next.js 15 (App Router, React 19, TypeScript) |
| Spring Boot API | Route handlers under `src/app/api` (same URLs and JSON) |
| MySQL | Postgres (Neon, via the Vercel Marketplace) |
| Uploads on disk | Static files in `public/media` |

Prices and trip types work as before. There is no admin page: change rates, settings and content directly in the database (Neon). There are no tests yet.

## Run it locally

```
npm install
cp .env.example .env.local
npm run seed                   # builds a local database in .data/ and loads the cities, routes, vehicles and photos
npm run dev                    # http://localhost:3000 
```

With no `DATABASE_URL` the app uses PGlite, a Postgres that runs inside Node, so no account or install is needed.
`npm run seed:reset` wipes the database and loads the starting data again.

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. On vercel.com choose **Add New > Project**, import the repository, keep the defaults (Framework: Next.js).
3. In the project open **Storage** and add a **Postgres** database (Neon). Vercel adds `DATABASE_URL` for you.
4. In **Settings > Environment Variables** add:
   - `NEXT_PUBLIC_SITE_URL` e.g. `https://247droptaxi.com`
   - `NEXT_PUBLIC_SUPPORT_EMAIL` and `NEXT_PUBLIC_BUSINESS_ADDRESS`
   - `GOOGLE_MAPS_API_KEY` (optional; without it the site uses the city dropdowns)
5. Load the starting data into the Vercel database once, from your own computer (do not use `vercel env pull`; it writes `[SENSITIVE]` for the database URL):
   ```
   DATABASE_URL="<connection string from Neon>" npm run seed
   ```
6. **Deploy** (or redeploy). Add your domain under **Settings > Domains** and set the DNS records Vercel shows at GoDaddy.

## Booking alert emails

Set `RESEND_API_KEY` and `BOOKING_ALERT_EMAIL` (comma separated for several people) and every new booking is emailed to you. Free account at resend.com; without a verified domain Resend only delivers to the email you signed up with, which is fine for owner alerts. Optional `BOOKING_ALERT_FROM` sets the sender once you verify a domain.

## Things to know

- The rate limiter keeps its counts in memory per server instance, so it is a soft limit on Vercel. Fine for guarding Google quota, not for security.
- Min km, GST rate, round-trip minimum, package hours and the road-distance factor live in `src/lib/config.ts`.
  The GST, package and Google-search switches and the phone numbers are rows in the `app_settings` table (edit them in Neon).
- Tolls and permit fees are never in a quoted total (extra, as per actuals).
- Policy and service pages (`src/lib/content.ts`) are placeholders to replace before launch.
- The route-map preview endpoints of the old backend (`/api/route-preview`, `/api/city-route-preview`) were not ported: no page used them.
- Bookings are saved with status PENDING. There is no payment, login or OTP yet.
