"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "../../lib/supabase";

type QueueStatus = "pending" | "processing" | "failed" | "completed";

type QueueItem = {
  id: number;
  url: string;
  status: QueueStatus;
  error: string | null;
  response_text?: string | null;
  recipe_id?: number | null;
  process_after?: string | null;
  created_at: string;
  updated_at?: string;
  last_attempt_at: string | null;
};

const DAILY_LIMIT = 20;
const RETRY_MINUTES = 5;
const RETRY_MS = RETRY_MINUTES * 60 * 1000;

function formatCountdown(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getNextRetryAt(item: QueueItem): number {
  const base = new Date(item.last_attempt_at || item.created_at).getTime();
  return base + RETRY_MS;
}

function isWaitlisted(item: QueueItem, nowMs: number): boolean {
  return !!item.process_after && new Date(item.process_after).getTime() > nowMs;
}

function formatWaitlistCountdown(item: QueueItem, nowMs: number): string {
  if (!item.process_after) return "";
  const msLeft = new Date(item.process_after).getTime() - nowMs;
  if (msLeft <= 0) return "Processing soon\u2026";
  const totalMin = Math.floor(msLeft / 60000);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function isRetryableFailure(item: QueueItem): boolean {
  if (item.status !== "failed") return false;
  const msg = String(item.error ?? "").toLowerCase();
  return (
    msg.includes("resource exhausted") ||
    msg.includes("rate limit") ||
    msg.includes("high demand") ||
    msg.includes("spikes in demand") ||
    msg.includes("service unavailable") ||
    msg.includes("503") ||
    msg.includes("fetch failed") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("socket hang up")
  );
}

export default function ImportPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  const loadQueue = async () => {
    setQueueLoading(true);
    try {
      const {
        data: { user }
      } = await supabaseBrowser.auth.getUser();

      if (!user) {
        setQueue([]);
        setQueueError("Please sign in first.");
        return;
      }

      const res = await fetch(`/api/import-queue?userId=${encodeURIComponent(user.id)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setQueueError(data.error || "Failed to load waiting list");
        return;
      }
      setQueueError(null);
      setQueue((data.items ?? []) as QueueItem[]);
    } catch {
      setQueueError("Failed to load waiting list");
    } finally {
      setQueueLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
    const interval = setInterval(loadQueue, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const pendingOrProcessing = useMemo(
    () => queue.filter((q) => q.status === "pending" || q.status === "processing"),
    [queue]
  );

  const dailyUsage = useMemo(() => {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    return queue.filter((q) => new Date(q.created_at).getTime() >= since).length;
  }, [queue, now]);

  const handleImport = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const {
        data: { user }
      } = await supabaseBrowser.auth.getUser();

      if (!user) {
        throw new Error("Please sign in first.");
      }

      const res = await fetch("/api/import-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed, userId: user.id })
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to import recipe");
      }

      if (data.status === "duplicate_in_queue") {
        setMessage(`Already in waiting list (status: ${data.queueStatus ?? "pending"}).`);
      } else if (data.status === "duplicate_in_dashboard") {
        setMessage("This link already exists in your dashboard recipes.");
      } else if (data.status === "rate_limit_queued") {
        setMessage(
          `Daily limit reached (${DAILY_LIMIT}/day). Your recipe is on the 24-hour waitlist and will import automatically.`
        );
      } else if (data.status === "imported") {
        setMessage("Imported and saved successfully.");
      } else if (data.status === "queued") {
        setMessage("Added to waiting list.");
      } else {
        setMessage("Request processed.");
      }

      setUrl("");
      await loadQueue();
    } catch (err: any) {
      setError(err.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  const renderRetryInfo = (item: QueueItem) => {
    if (item.status === "processing") {
      return "Retry timer: trying now";
    }

    if (item.status === "completed") {
      return "Retry timer: done";
    }

    if (item.status === "failed" && !isRetryableFailure(item)) {
      return "Retry timer: not retrying (permanent failure)";
    }

    const nextRetryAt = getNextRetryAt(item);
    const msLeft = nextRetryAt - now;

    if (msLeft <= 0) {
      return "Retry timer: 5 minutes done (ready for retry)";
    }

    return `Retry timer: ${formatCountdown(msLeft)} left`;
  };

  const handleDeleteQueueItem = async (id: number) => {
    setDeletingId(id);
    setQueueError(null);
    try {
      const res = await fetch(`/api/import-queue/${id}`, {
        method: "DELETE"
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete item");
      }
      setQueue((prev) => prev.filter((item) => item.id !== id));
    } catch (err: any) {
      setQueueError(err.message || "Failed to delete item");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Import recipe URL</h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Recipe URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/recipe"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <button
            type="button"
            onClick={handleImport}
            disabled={!url.trim() || loading}
            className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Submitting..." : "Import"}
          </button>

          <p className="text-xs text-slate-500">
            Daily usage: <span className={dailyUsage >= DAILY_LIMIT ? "font-semibold text-amber-700" : ""}>{dailyUsage} / {DAILY_LIMIT}</span> imports in the last 24 hours
          </p>

          {message && <p className="text-sm text-slate-700">{message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </section>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-base font-semibold">Waiting list</h3>
        {queueError && <p className="mb-2 text-sm text-red-600">{queueError}</p>}
        {queueLoading && <p className="mb-2 text-sm text-slate-600">Refreshing...</p>}

        {queue.length === 0 ? (
          <p className="text-sm text-slate-600">No items yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {queue.map((item) => (
              <li key={item.id} className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 truncate text-blue-700 underline"
                  >
                    {item.url}
                  </a>
                  {isWaitlisted(item, now) ? (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      waitlisted
                    </span>
                  ) : (
                    <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-800">
                      {item.status}
                    </span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {item.status === "completed" && item.recipe_id && (
                    <a href={`/recipes/${item.recipe_id}`} className="inline-block text-xs text-emerald-700 underline">
                      Open in dashboard
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteQueueItem(item.id)}
                    disabled={deletingId === item.id}
                    className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deletingId === item.id ? "Deleting..." : "Delete"}
                  </button>
                </div>

                <p className="mt-1 text-xs text-slate-700">
                  {isWaitlisted(item, now)
                    ? `⏳ 24-hour waitlist — processes in ${formatWaitlistCountdown(item, now)}`
                    : renderRetryInfo(item)}
                </p>

                {item.error && <p className="mt-1 text-xs text-red-700">API error: {item.error}</p>}

                {item.response_text && (
                  <details className="mt-1 text-xs text-slate-700">
                    <summary className="cursor-pointer">AI/API response</summary>
                    <pre className="whitespace-pre-wrap break-words">{item.response_text}</pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-xs text-slate-500">
          Active imports: {pendingOrProcessing.length}. Retries happen every {RETRY_MINUTES} minutes.
        </p>
      </section>
    </div>
  );
}
