"use client";

import { useEffect } from "react";

export default function QueuePoller() {
  useEffect(() => {
    const run = () => {
      fetch("/api/import-queue/retry", { method: "POST" }).catch(() => {
        // ignore
      });
    };

    // Try once on mount
    run();

    const interval = setInterval(run, 5 * 60 * 1000); // every 5 minutes
    return () => clearInterval(interval);
  }, []);

  return null;
}

