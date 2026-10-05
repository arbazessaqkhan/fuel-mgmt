# FuelLog Fleet Manager — Deployment Guide (100% free tier)

Deploy the app on **Vercel** (frontend + backend), **Neon** (PostgreSQL database) and
**Backblaze B2** (voucher image storage, 10 GB free). No credit card needed anywhere.

---

## 0. What you need before starting
- Your login credentials for the app: `AUTH_USERNAME` / `AUTH_PASSWORD` (currently
  `EmpPdcFuel` / `EP@2026#` — keep them private; rotate before going live if you wish).
- A JSON backup of your existing vouchers (from the app: Dashboard → Backup, or
  `GET /api/backup` while logged in), if you want to carry existing data over.

---

## 1. Neon — free PostgreSQL database
1. Sign up at https://neon.tech (email or GitHub — no card).
2. Create a project, e.g. `fuellog`.
3. Open **Dashboard → Connection string → Prisma** and copy the string. It looks like:
   `postgresql://USER:PASSWORD@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`
   → this is your **DATABASE_URL**. Copy it somewhere safe.

## 2. Backblaze B2 — free private image storage (10 GB)
1. Sign up at https://www.backblaze.com (email only — no card).
2. Go to **B2 Cloud Storage → Buckets → Create a Bucket**:
   - Name: e.g. `fuellog-images`
   - **Private** (default) — do NOT make it public.
3. Go to **Application Keys → Add a New Application Key**:
   - Name: `fuellog-app`, allow access to only the bucket above.
   - After creating, you'll see `keyID` and `applicationKey` (shown once — save both).
   - Also note the **endpoint**: Buckets → your bucket → Endpoint, like
     `https://s3.us-west-004.backblazeb2.com`.

## 3. Vercel — free hosting
1. Sign up at https://vercel.com (GitHub or email — no card).
2. Push this code to a GitHub repo, then in Vercel: **Add New → Project → Import**.
   Framework preset: **Next.js** (auto-detected). Do not deploy yet — first add the
   environment variables below (**Settings → Environment Variables**).

### Environment variables (all of these, in Vercel)
| Name | Value | Where it comes from |
|---|---|---|
| `DATABASE_URL` | the postgresql:// string | Neon step 1 |
| `AUTH_USERNAME` | your login username | you |
| `AUTH_PASSWORD` | your login password | you |
| `AUTH_SECRET` | any long random string (32+ chars) | make one up, e.g. `openssl rand -hex 24` |
| `B2_ENDPOINT` | `https://s3.<region>.backblazeb2.com` | B2 step 2 |
| `B2_BUCKET` | your bucket name | B2 step 2 |
| `B2_KEY_ID` | application key ID | B2 step 3 |
| `B2_APP_KEY` | application key | B2 step 3 |

> Without `AUTH_SECRET` / `AUTH_USERNAME` / `AUTH_PASSWORD` the app will refuse
> logins (by design). Without the B2 vars, uploads only work in local dev —
> they will NOT persist on Vercel, so set them.

## 4. Create the database tables
From your machine (one-time), with `DATABASE_URL` set to the Neon string:
```bash
npm install
npx prisma db push
```
This creates the `fuel_vouchers` table on Neon. Then click **Deploy** in Vercel.

## 5. Import your existing data (optional)
1. In Vercel, temporarily add `IMPORT_ALLOWED=1` (or skip — see note).
2. Simpler path: ask the workspace agent to run the import script
   (`scripts/import-backup.mjs`) with your backup JSON against the Neon URL.

> The import endpoint is intentionally not public. The safest route is running the
> import script locally against Neon — it only inserts rows, images stay where they are.

## 6. Verify
1. Open your Vercel URL → login page appears → log in with your credentials.
2. Scan page → upload a voucher image → save → image displays.
3. Log out, open a saved image URL directly → must be **blocked** (redirect/401).
4. Wrong password 6× → "too many attempts" message.

---

## Local development
`cp .env.example .env` and fill in values. Without B2 vars the app stores images
on local disk; without Neon, point `DATABASE_URL` at any local Postgres.

## Security notes
- All pages and APIs require login; voucher images are served only through the
  authenticated `/api/images/...` route — the B2 bucket itself stays private.
- Login is rate-limited (5 failures / 10 min per IP).
- No credentials live in the code — everything is environment-based.
