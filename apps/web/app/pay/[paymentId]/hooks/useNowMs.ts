"use client";

import { useEffect, useState } from "react";

export function useNowMs(intervalMs = 250) {
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return nowMs;
}
