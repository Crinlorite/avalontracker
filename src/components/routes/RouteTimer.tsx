"use client";

import { useState, useEffect } from "react";

interface RouteTimerProps {
  expiresAt: string;
}

export default function RouteTimer({ expiresAt }: RouteTimerProps) {
  const [timeLeft, setTimeLeft] = useState(() => calcTimeLeft());

  function calcTimeLeft() {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.floor(diff / 1000);
  }

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(calcTimeLeft());
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  const isExpired = timeLeft <= 0;
  const absSeconds = Math.abs(timeLeft);
  const hours = Math.floor(absSeconds / 3600);
  const minutes = Math.floor((absSeconds % 3600) / 60);
  const seconds = absSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");
  const display = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

  const minutesRemaining = timeLeft / 60;

  let colorClass: string;
  if (isExpired) {
    colorClass = "text-blue-400 animate-pulse";
  } else if (minutesRemaining < 30) {
    colorClass = "text-red-400";
  } else if (minutesRemaining < 60) {
    colorClass = "text-orange-400";
  } else {
    colorClass = "text-green-400";
  }

  return (
    <span className={`font-mono text-sm font-semibold ${colorClass}`}>
      {isExpired ? `-${display}` : display}
    </span>
  );
}
