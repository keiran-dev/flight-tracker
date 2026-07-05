import { useEffect, useState } from "react";
import RouteCard from "./RouteCard";
import "./board.css";

export default function App() {
  const [routes, setRoutes] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/summary.json`)
      .then((r) => r.json())
      .then(setRoutes)
      .catch(() => setError(true));
  }, []);

  return (
    <div className="board">
      <header className="board__header">
        <div>
          <div className="board__eyebrow">Fare Board</div>
          <h1 className="board__title">Tracked routes</h1>
        </div>
        <div className="board__clock">
          {new Date().toLocaleDateString(undefined, {
            weekday: "short",
            day: "2-digit",
            month: "short",
          })}
        </div>
      </header>

      <main className="board__list">
        {error && (
          <p className="board__empty">
            Couldn't load price data. If you just deployed this, the first
            GitHub Action run hasn't happened yet — trigger it manually from
            the Actions tab, or wait for the daily schedule.
          </p>
        )}

        {!error && routes === null && (
          <p className="board__empty">Loading…</p>
        )}

        {!error && routes && routes.length === 0 && (
          <p className="board__empty">
            No data yet. This board updates once a day via a GitHub Action —
            trigger it manually from the Actions tab in your repo to see the
            first prices, or add routes in{" "}
            <code>config/routes.json</code>.
          </p>
        )}

        {routes && routes.length > 0 && (
          <div className="board__grid">
            {routes.map((route) => (
              <RouteCard key={route.id} route={route} />
            ))}
          </div>
        )}
      </main>

      <footer className="board__footer">
        Prices are cheapest one-way fares from Travelpayouts' cached search
        data, checked once a day — a proxy for return-trip cost, not a live
        booking price. Always confirm on the airline or agent's site before
        buying.
      </footer>
    </div>
  );
}
