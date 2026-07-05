#!/usr/bin/env python3
"""
Fetch flight prices from the Travelpayouts Data API (the aggregator behind
Aviasales/Jetradar) for each route in config/routes.json, append the
result to data/history/<route_id>.json, and send a notification (via
ntfy.sh) if the price is a genuine deal.

Why Travelpayouts and not Amadeus: Amadeus decommissioned its free
self-service portal on 17 July 2026. Travelpayouts' Data API remains free
to register and use (no minimum traffic requirement — that requirement
only applies to their separate real-time booking/search API). The
trade-off is that prices come from a cache of recent real searches rather
than a live shop, which is a good fit for a once-a-day trend tracker like
this one.

Required environment variables:
  TRAVELPAYOUTS_TOKEN   your free Data API token (see README)

Optional:
  NTFY_TOPIC             your private ntfy.sh topic name (see README)
"""

import json
import os
import statistics
import sys
from datetime import datetime, timezone
from dateutil.relativedelta import relativedelta
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "config" / "routes.json"
HISTORY_DIR = ROOT / "data" / "history"
SUMMARY_PATH = ROOT / "data" / "summary.json"

BASE_URL = "https://api.travelpayouts.com"

BASELINE_WINDOW = 30       # how many past checks to consider for the rolling baseline
BASELINE_DROP_PCT = 0.15   # flag a deal if price is >=15% below the rolling median


def month_starts(date_from: str, date_to: str) -> list[str]:
    """Returns YYYY-MM for every month touched by the range, so we can call
    the calendar endpoint (which is per-month) across the whole window."""
    start = datetime.strptime(date_from, "%Y-%m-%d").date().replace(day=1)
    end = datetime.strptime(date_to, "%Y-%m-%d").date().replace(day=1)
    months = []
    cur = start
    while cur <= end:
        months.append(cur.strftime("%Y-%m"))
        cur = cur + relativedelta(months=1)
    return months


def fetch_calendar_month(token: str, route: dict, month: str, currency: str) -> list[dict]:
    """Calls /v1/prices/calendar for one route/month. Returns the cheapest
    fare found for each day that has data."""
    params = {
        "origin": route["origin"],
        "destination": route["destination"],
        "depart_date": month,
        "calendar_type": "departure_date",
        "currency": currency.lower(),
    }
    resp = requests.get(
        f"{BASE_URL}/v1/prices/calendar",
        headers={"x-access-token": token},
        params=params,
        timeout=30,
    )
    resp.raise_for_status()
    payload = resp.json()
    if not payload.get("success"):
        return []
    return [
        {
            "departureDate": date,
            "returnDate": None,
            "price": float(info["price"]),
        }
        for date, info in payload.get("data", {}).items()
        if info and info.get("price")
    ]


def fetch_cheapest_dates(token: str, route: dict, currency: str) -> list[dict]:
    offers = []
    for month in month_starts(route["departDateFrom"], route["departDateTo"]):
        try:
            offers.extend(fetch_calendar_month(token, route, month, currency))
        except requests.HTTPError as e:
            print(f"    (skipping {month}: {e})", file=sys.stderr)
    return offers


def load_history(route_id: str) -> list[dict]:
    path = HISTORY_DIR / f"{route_id}.json"
    if path.exists():
        return json.loads(path.read_text())
    return []


def save_history(route_id: str, history: list[dict]) -> None:
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    path = HISTORY_DIR / f"{route_id}.json"
    path.write_text(json.dumps(history, indent=2))


def send_notification(title: str, message: str) -> None:
    topic = os.environ.get("NTFY_TOPIC")
    if not topic:
        print(f"[notify skipped, no NTFY_TOPIC set] {title}: {message}")
        return
    try:
        requests.post(
            f"https://ntfy.sh/{topic}",
            data=message.encode("utf-8"),
            headers={"Title": title, "Priority": "default", "Tags": "airplane"},
            timeout=15,
        )
    except requests.RequestException as e:
        print(f"Notification failed: {e}", file=sys.stderr)


def process_route(token: str, route: dict, currency: str) -> dict:
    route_id = route["id"]
    print(f"Checking {route_id} ({route['origin']} -> {route['destination']})...")

    offers = fetch_cheapest_dates(token, route, currency)
    if not offers:
        print(f"  No fares returned for {route_id}")
        return {"id": route_id, "label": route["label"], "status": "no_data"}

    best = min(offers, key=lambda o: o["price"])
    today = datetime.now(timezone.utc).date().isoformat()

    history = load_history(route_id)
    history.append(
        {
            "checkedAt": today,
            "price": best["price"],
            "departureDate": best["departureDate"],
            "returnDate": best["returnDate"],
        }
    )
    save_history(route_id, history)

    # Rolling baseline from the last N checks (excluding today's just-added entry)
    past_prices = [h["price"] for h in history[:-1]][-BASELINE_WINDOW:]
    baseline = statistics.median(past_prices) if len(past_prices) >= 5 else None

    is_below_threshold = best["price"] <= route.get("threshold", float("inf"))
    is_below_baseline = (
        baseline is not None and best["price"] <= baseline * (1 - BASELINE_DROP_PCT)
    )

    if is_below_threshold or is_below_baseline:
        reasons = []
        if is_below_threshold:
            reasons.append(f"under your {currency} {route['threshold']} target")
        if is_below_baseline:
            reasons.append(f"{round((1 - best['price']/baseline)*100)}% below its recent median")
        send_notification(
            title=f"Deal: {route['label']}",
            message=(
                f"{currency} {best['price']:.0f} for departure {best['departureDate']} "
                f"({', '.join(reasons)})"
            ),
        )
        print(f"  DEAL FOUND: {currency} {best['price']:.0f} ({', '.join(reasons)})")
    else:
        print(f"  Best price today: {currency} {best['price']:.0f}")

    return {
        "id": route_id,
        "label": route["label"],
        "status": "ok",
        "latestPrice": best["price"],
        "latestDeparture": best["departureDate"],
        "latestReturn": best["returnDate"],
        "baseline": baseline,
        "currency": currency,
        "threshold": route.get("threshold"),
        "lastChecked": today,
        "isDeal": bool(is_below_threshold or is_below_baseline),
    }


def main() -> None:
    config = json.loads(CONFIG_PATH.read_text())
    currency = config.get("currency", "GBP")
    token = os.environ["TRAVELPAYOUTS_TOKEN"]

    summary = []
    for route in config["routes"]:
        try:
            summary.append(process_route(token, route, currency))
        except requests.HTTPError as e:
            print(f"  API error for {route['id']}: {e}", file=sys.stderr)
            summary.append({"id": route["id"], "label": route["label"], "status": "error"})

    SUMMARY_PATH.write_text(json.dumps(summary, indent=2))
    print("Done.")


if __name__ == "__main__":
    main()
