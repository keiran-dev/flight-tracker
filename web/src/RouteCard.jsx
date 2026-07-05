import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import FlipDigits from "./FlipDigits";

const currencySymbols = { GBP: "£", USD: "$", EUR: "€" };

export default function RouteCard({ route }) {
  const [history, setHistory] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded || history) return;
    fetch(`${import.meta.env.BASE_URL}data/history/${route.id}.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [expanded, route.id, history]);

  const symbol = currencySymbols[route.currency] || route.currency + " ";

  if (route.status !== "ok") {
    return (
      <div className="route-card route-card--pending">
        <div className="route-card__label">{route.label}</div>
        <div className="route-card__pending-text">
          {route.status === "error"
            ? "Last check failed — see the Actions tab for details."
            : "No fares found yet for this route."}
        </div>
      </div>
    );
  }

  return (
    <div className={`route-card${route.isDeal ? " route-card--deal" : ""}`}>
      <div className="route-card__top">
        <div>
          <div className="route-card__label">{route.label}</div>
          <div className="route-card__dates">
            Cheapest one-way: {route.latestDeparture}
          </div>
        </div>
        {route.isDeal && <span className="route-card__badge">DEAL</span>}
      </div>

      <div className="route-card__price-row">
        <FlipDigits value={route.latestPrice} prefix={symbol} />
        {route.baseline && (
          <span className="route-card__baseline">
            30-day median {symbol}
            {Math.round(route.baseline)}
          </span>
        )}
      </div>

      <div className="route-card__meta">
        Last checked {route.lastChecked}
      </div>

      <button
        className="route-card__toggle"
        onClick={() => setExpanded((e) => !e)}
      >
        {expanded ? "Hide history ▲" : "Show price history ▼"}
      </button>

      {expanded && (
        <div className="route-card__chart">
          {!history ? (
            <div className="route-card__pending-text">Loading…</div>
          ) : history.length < 2 ? (
            <div className="route-card__pending-text">
              Not enough history yet — check back after a few more daily runs.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={history}>
                <XAxis
                  dataKey="checkedAt"
                  stroke="var(--text-muted)"
                  tick={{ fontSize: 11, fontFamily: "var(--font-display)" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={30}
                />
                <YAxis hide domain={["dataMin - 20", "dataMax + 20"]} />
                <Tooltip
                  contentStyle={{
                    background: "var(--panel-bg)",
                    border: "1px solid var(--panel-border)",
                    fontFamily: "var(--font-display)",
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "var(--text-muted)" }}
                />
                {route.threshold && (
                  <ReferenceLine
                    y={route.threshold}
                    stroke="var(--deal-green)"
                    strokeDasharray="4 4"
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="var(--amber)"
                  strokeWidth={2}
                  dot={{ r: 2, fill: "var(--amber)" }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}
