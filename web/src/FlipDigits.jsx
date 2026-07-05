import { useEffect, useState } from "react";

// Renders a number as individual split-flap style digits that flip in
// on mount / whenever the value changes. This is the one signature
// visual flourish of the board — everything else stays quiet.
export default function FlipDigits({ value, prefix = "" }) {
  const [display, setDisplay] = useState(value);
  const [flipping, setFlipping] = useState(false);

  useEffect(() => {
    if (value === display) return;
    setFlipping(true);
    const t = setTimeout(() => {
      setDisplay(value);
      setFlipping(false);
    }, 260);
    return () => clearTimeout(t);
  }, [value]);

  const chars = `${prefix}${Math.round(display)}`.split("");

  return (
    <span className="flip-digits" aria-label={`${prefix}${Math.round(value)}`}>
      {chars.map((ch, i) => (
        <span
          key={i}
          className={`flip-char${flipping ? " flip-char--flipping" : ""}`}
          style={{ animationDelay: `${i * 35}ms` }}
        >
          {ch}
        </span>
      ))}
    </span>
  );
}
