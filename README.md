# Fare Board

A free flight price tracker. A GitHub Action checks prices once a day using
the Travelpayouts Data API, commits the results as JSON, and a small React
dashboard (hosted free on Netlify) reads that JSON and shows you the trend —
with a push notification when a price drops below a target or below its
own recent average.

No server, no database, no AI, no ongoing cost.

```
your fare board
├── config/routes.json        ← which routes you're tracking, and your target prices
├── data/                     ← price history, committed daily by the Action
├── scripts/fetch_prices.py   ← the script the Action runs
├── .github/workflows/        ← the daily schedule
└── web/                      ← the React dashboard
```

## A note on data source

This originally targeted the Amadeus Self-Service API, but Amadeus
decommissioned that free portal on 17 July 2026 (enterprise access only
now). It's built instead on **Travelpayouts' Data API** — the same
aggregator that powers Aviasales and Jetradar — which remains free to
register and use.

The trade-off: Travelpayouts returns **cheapest one-way fares** from a
cache of recent real searches, not a live shop and not round-trip pricing.
For a once-a-day trend tracker that's a fine fit — you're watching for
*"is this route unusually cheap right now"*, not booking directly off the
number. Treat the price shown as a proxy for return-trip cost (roughly
double it), and always check the real fare on the airline/agent site
before buying.

## How it works

1. **GitHub Actions** runs `scripts/fetch_prices.py` on a daily cron (06:15 UTC
   by default — edit `.github/workflows/track-prices.yml` to change it).
2. The script calls Travelpayouts' `/v1/prices/calendar` endpoint for each
   month in your route's date window, finds the cheapest one-way fare
   across the whole range, and appends it to
   `data/history/<route-id>.json`.
3. If the price is below your `threshold`, or at least 15% below the
   30-day rolling median for that route, it pushes a **free notification**
   via [ntfy.sh](https://ntfy.sh) to your phone.
4. The Action commits the updated `data/` folder back to the repo.
5. **Netlify** rebuilds the site automatically whenever the repo changes,
   so the dashboard always reflects the latest commit.

## One-time setup

### 1. Get a free Travelpayouts Data API token

- Register at [travelpayouts.com](https://www.travelpayouts.com) (free).
  It's built as an affiliate platform, so signup asks about "your site" —
  you don't need a real one for Data API access, any placeholder answer
  is fine.
- Once logged in, go to your dashboard's API tools page (Tools → API, or
  `travelpayouts.com/programs/100/tools/api`) and grab your access token.
  This maps to `TRAVELPAYOUTS_TOKEN` below.
- Rate limit on the calendar endpoint is 300 requests/minute — miles more
  than a daily check of a few routes will ever use.

### 2. Set up notifications (optional but recommended)

- Install the [ntfy app](https://ntfy.sh/) on your phone (iOS/Android), or
  just use the web app.
- Pick a private topic name — anything hard-to-guess works, e.g.
  `keiran-fareboard-x7f2`. Anyone who knows the exact topic name can see
  your notifications, so don't use something guessable.
- Subscribe to that topic name in the app. That's it — no account, no key.

### 3. Push this repo to GitHub

```bash
cd flight-tracker
git add -A
git commit -m "Initial commit"
git remote add origin https://github.com/<you>/fare-board.git
git branch -M main
git push -u origin main
```

### 4. Add your secrets to GitHub

In your repo: **Settings → Secrets and variables → Actions → New repository
secret**. Add:

| Name | Value |
|---|---|
| `TRAVELPAYOUTS_TOKEN` | your free Travelpayouts Data API token |
| `NTFY_TOPIC` | your ntfy topic name (optional — skip and it just logs instead) |

### 5. Run it once manually

Go to the **Actions** tab → "Track flight prices" → **Run workflow**. Check
the logs. If it worked, you'll see a new commit adding data to `data/`.
The `threshold` in `config/routes.json` starts as a rough placeholder —
once you see a few real one-way prices come through, tighten it to
whatever actually counts as a deal for you.

### 6. Deploy the dashboard on Netlify (free)

- [app.netlify.com](https://app.netlify.com) → **Add new site → Import an
  existing project** → connect the GitHub repo.
- Netlify will read `netlify.toml` at the repo root automatically — no
  manual build settings needed (base directory `web`, build command
  `npm run build`, publish directory `web/dist`).
- Every time the daily Action commits new price data, Netlify redeploys
  automatically.

## Adding or changing routes

Edit `config/routes.json`:

```json
{
  "id": "lhr-bkk",
  "label": "London → Bangkok",
  "origin": "LHR",
  "destination": "BKK",
  "departDateFrom": "2026-09-01",
  "departDateTo": "2026-11-30",
  "threshold": 280
}
```

- `id` becomes the filename in `data/history/` — keep it short, lowercase,
  no spaces.
- `departDateFrom` / `departDateTo` define the search window; the script
  checks every month touched by that range and keeps the cheapest date.
- `threshold` is your one-way "just tell me if it's under this" price —
  set it generously at first, then tighten it once you've seen real data.
- Commit the change; the next scheduled run (or a manual trigger) will pick
  up the new route.

## Local development

```bash
cd web
npm install
npm run dev
```

This copies the root `data/` folder into `web/public/data` automatically
(see `web/scripts/sync-data.mjs`) so the dashboard has something to read
locally.

## Extending it

The pattern here — scheduled fetch → append to JSON → static dashboard
reads it → notify on anomaly — isn't flight-specific. The same shape works
for tracking a product price on any site with a stable product-page
structure or an affiliate API (Amazon Product Advertising API, eBay's
Browse API, etc). If you want to add a product tracker later, it'd live
as a second script alongside `fetch_prices.py`, writing into its own
`data/products/` folder, with its own card component in the dashboard.

## Costs

£0, as long as you stay within: GitHub Actions free minutes (a daily
one-minute job uses almost none of your monthly allowance), Travelpayouts'
free Data API tier, Netlify's free tier, and ntfy's free tier. There's
nothing here that requires a credit card.
