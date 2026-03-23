"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Recipe } from "../../types/recipe";

type QueueItem = {
  id: number;
  url: string;
  status: string;
  error: string | null;
  response_text?: string | null;
  recipe_id?: number | null;
  created_at: string;
  last_attempt_at: string | null;
};

const RETRY_MINUTES = 5;

function formatCountdown(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function isTransientGeminiFailure(item: QueueItem) {
  if (item.status !== "failed") return false;
  const msg = String(item.error ?? "").toLowerCase();
  return (
    msg.includes("high demand") ||
    msg.includes("spikes in demand") ||
    msg.includes("service unavailable") ||
    msg.includes("[503") ||
    msg.includes(" 503 ") ||
    msg.includes("503") ||
    msg.includes("resource exhausted") ||
    msg.includes("rate limit")
  );
}

export default function ImportPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [apiResponse, setApiResponse] = useState<string | null>(null);
  const [preview, setPreview] = useState<Recipe | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());

  const loadQueue = async () => {
    setQueueLoading(true);
    try {
      const res = await fetch("/api/import-queue");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setQueueError(data.error || "Failed to load waiting list");
        return;
      }
      setQueueError(null);
      setQueue((data.items ?? []) as QueueItem[]);
      setApiResponse(null);
    } catch {
      setQueueError("Failed to load waiting list");
    } finally {
      setQueueLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
    const interval = setInterval(loadQueue, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleImport = async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    setSavedId(null);
    try {
      const res = await fetch("/api/import-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const data = await res.json().catch(() => ({}));
      setApiResponse(data.rawResponse || null);

      if (data.status === "imported" && data.recipeId) {
        setInfo(
          "Recipe imported and saved. You can find it on the dashboard."
        );
        setSavedId(data.recipeId);
        setPreview(null);
        loadQueue();
        return;
      }

      if (data.status === "queued") {
        setInfo(
          "Your link is in the waiting list (pending). The app will retry every 5 minutes until it shows up on the dashboard."
        );
        setPreview(null);
        if (data.queueId) {
          // Optimistic: show it immediately even before refresh
          const optimistic: QueueItem = {
            id: Number(data.queueId),
            url,
            status: "pending",
            error: null,
            response_text: data.rawResponse || null,
            created_at: new Date().toISOString(),
            last_attempt_at: null
          };
          setQueue((prev) => {
            if (prev.some((p) => p.id === optimistic.id)) return prev;
            return [optimistic, ...prev];
          });
        }
        loadQueue();
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to import recipe");
      }

      // Backwards compatibility if the API ever returns a full recipe again
      if (data.recipe) {
        setPreview(data.recipe);
      }

      loadQueue();
    } catch (err: any) {
      setError(err.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preview)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save recipe");
      }
      const data = await res.json();
      setSavedId(data.id);
    } catch (err: any) {
      setError(err.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <motion.section
        className="rounded-lg bg-white p-4 shadow-sm"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h2 className="mb-3 text-lg font-semibold">Import recipe from URL</h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Recipe URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/your-favorite-recipe"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <motion.button
            type="button"
            onClick={handleImport}
            disabled={!url || loading}
            className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            whileHover={!loading ? { scale: 1.04 } : {}}
            whileTap={!loading ? { scale: 0.95 } : {}}
          >
            {loading ? "Importing..." : "Import recipe"}
          </motion.button>
          {info && !error && (
            <p className="text-sm text-slate-700">{info}</p>
          )}
          {apiResponse && (
            <div className="mt-1 max-h-32 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-2 text-xs">
              <strong>AI response:</strong>
              <pre className="whitespace-pre-wrap break-words">{apiResponse}</pre>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </motion.section>

      <motion.section
        className="rounded-lg bg-white p-4 shadow-sm"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.3 }}
      >
        <h3 className="mb-2 text-base font-semibold">Waiting list</h3>
        {queueError && (
          <p className="mb-2 text-sm text-red-600">{queueError}</p>
        )}
        {queueLoading && (
          <p className="mb-2 text-sm text-slate-600">Refreshing list…</p>
        )}

        {queue.filter((q) => q.status !== "completed").length === 0 ? (
          <p className="text-sm text-slate-600">
            No URLs in the waiting list.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            <AnimatePresence>
              {queue
                .filter((q) => q.status !== "completed")
                .map((item) => (
                <motion.li
                  key={item.id}
                  className="flex flex-col rounded border border-slate-200 bg-slate-50 px-3 py-2"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-slate-800">{item.url}</span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          item.status === "processing"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {item.status === "failed" ? "pending" : item.status}
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          console.log(`[CANCEL] Starting delete for item ${item.id}`);
                          // optimistic removal immediately so UI feels snappy
                          setQueue((prev) => prev.filter((q) => q.id !== item.id));
                          try {
                            const url = `/api/import-queue/${item.id}`;
                            console.log(`[CANCEL] Fetching DELETE ${url}`);
                            const res = await fetch(url, {
                              method: "DELETE"
                            });
                            console.log(`[CANCEL] Response status: ${res.status}`);
                            const data = await res.json().catch(() => ({}));
                            console.log(`[CANCEL] Response data:`, data);
                            if (!res.ok) {
                              console.error(`[CANCEL] Failed with status ${res.status}:`, data);
                              setQueueError(data.error || "Failed to remove item");
                            } else {
                              console.log(`[CANCEL] Success, clearing error`);
                              setQueueError(null);
                            }
                          } catch (err) {
                            console.error(`[CANCEL] Exception:`, err);
                            setQueueError("Failed to remove item");
                          } finally {
                            console.log(`[CANCEL] Reloading queue...`);
                            // always refresh the list to reflect server state
                            await loadQueue();
                            console.log(`[CANCEL] Queue reloaded`);
                          }
                        }}
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                    {item.status === "processing" ? (
                      <span>Trying now…</span>
                    ) : (
                      (() => {
                        const base = new Date(
                          item.last_attempt_at || item.created_at
                        ).getTime();
                        const next = base + RETRY_MINUTES * 60 * 1000;
                        const msLeft = next - now;
                        return (
                          <span>
                            Next try in{" "}
                            <span className="font-semibold tabular-nums text-slate-800">
                              {formatCountdown(msLeft)}
                            </span>
                          </span>
                        );
                      })()
                    )}
                    {item.last_attempt_at && (
                      <span className="text-slate-500">
                        Last attempt:{" "}
                        {new Date(item.last_attempt_at).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                  {item.error && (
                    <p className="mt-1 text-xs text-slate-600 line-clamp-2">
                      {item.error}
                    </p>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}

        {/* completed items */}
        {queue.some((q) => q.status === "completed") && (
          <div className="mt-4">
            <h4 className="mb-2 text-sm font-semibold text-emerald-800">
              Completed imports
            </h4>
            <ul className="space-y-2 text-sm">
              {queue
                .filter((q) => q.status === "completed")
                .map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-col rounded border border-emerald-200 bg-emerald-50 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-slate-800">{item.url}</span>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          completed
                        </span>
                        {item.recipe_id && (
                          <a
                            href={`/recipes/${item.recipe_id}`}
                            className="text-xs text-blue-600 underline"
                          >
                            View recipe
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            setQueue((prev) => prev.filter((q) => q.id !== item.id));
                            try {
                              const res = await fetch(`/api/import-queue/${item.id}`, {
                                method: "DELETE"
                              });
                              const data = await res.json().catch(() => ({}));
                              if (!res.ok) {
                                console.error("completed-remove error", data);
                                setQueueError(data.error || "Failed to remove item");
                              } else {
                                setQueueError(null);
                              }
                            } catch (err) {
                              console.error("completed-remove exception", err);
                              setQueueError("Failed to remove item");
                            } finally {
                              await loadQueue();
                            }
                          }}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    {item.response_text && (
                      <details className="mt-1 text-xs text-slate-700">
                        <summary className="cursor-pointer">AI response</summary>
                        <pre className="whitespace-pre-wrap break-words">{item.response_text}</pre>
                      </details>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        )}

        {queue.some((q) => q.status === "failed" && !isTransientGeminiFailure(q)) && (
          <div className="mt-4">
            <h4 className="mb-2 text-sm font-semibold text-slate-800">
              Failed imports
            </h4>
            <ul className="space-y-2 text-sm">
              {queue
                .filter((q) => q.status === "failed" && !isTransientGeminiFailure(q))
                .map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-col rounded border border-red-200 bg-red-50 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-slate-800">{item.url}</span>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                          failed
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            setQueue((prev) => prev.filter((q) => q.id !== item.id));
                            try {
                              const res = await fetch(
                                `/api/import-queue/${item.id}`,
                                {
                                  method: "DELETE"
                                }
                              );
                              const data = await res.json().catch(() => ({}));
                              if (!res.ok) {
                                console.error("failed-remove error", data);
                                setQueueError(
                                  data.error || "Failed to remove failed import"
                                );
                              } else {
                                setQueueError(null);
                              }
                            } catch (err) {
                              console.error("failed-remove exception", err);
                              setQueueError("Failed to remove failed import");
                            } finally {
                              await loadQueue();
                            }
                          }}
                          className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    {item.error && (
                      <p className="mt-1 text-xs text-red-700 line-clamp-2">
                        {item.error}
                      </p>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        )}
      </motion.section>

      {preview && (
        <motion.section
          className="space-y-3 rounded-lg bg-white p-4 shadow-sm"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">Preview</h3>
            <motion.button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              whileTap={!loading ? { scale: 0.96 } : {}}
            >
              {loading ? "Saving..." : "Save to database"}
            </motion.button>
          </div>
          <div className="space-y-2 text-sm">
            <div>
              <div className="text-lg font-semibold">{preview.title}</div>
              <p className="text-slate-600">{preview.description}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
              <span className="rounded-full bg-blue-50 px-2 py-0.5">
                {preview.meal_type}
              </span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5">
                {preview.dish_type}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5">
                {preview.servings} servings
              </span>
            </div>
            <div>
              <h4 className="mb-1 text-sm font-semibold">Ingredients</h4>
              <ul className="list-disc space-y-0.5 pl-5">
                {preview.ingredients.map((ing, idx) => (
                  <li key={idx}>
                    {ing.amount} {ing.unit} {ing.name}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="mb-1 text-sm font-semibold">Steps</h4>
              <ol className="list-decimal space-y-0.5 pl-5">
                {preview.steps.map((step) => (
                  <li key={step.step_number}>{step.instruction}</li>
                ))}
              </ol>
            </div>
            {savedId && (
              <p className="pt-1 text-sm text-emerald-700">
                Saved!{" "}
                <a
                  href={`/recipes/${savedId}`}
                  className="underline hover:text-emerald-900"
                >
                  View recipe
                </a>
              </p>
            )}
          </div>
        </motion.section>
      )}
    </div>
  );
}

