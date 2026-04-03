"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { WEEK_DAYS, WEEKMENU_SLOT } from "../../lib/weekmenu";
import { supabaseBrowser } from "../../lib/supabase";

type RecipeSummary = {
  id: number;
  title: string;
  servings: number;
};

type WeekMenuItem = {
  id: number;
  day_of_week: number;
  meal_slot: typeof WEEKMENU_SLOT;
  recipe_id: number | null;
  planned_servings: number | null;
  updated_at: string;
};

export default function WeekMenuPage() {
  const [weekStart, setWeekStart] = useState<string>("");
  const [items, setItems] = useState<WeekMenuItem[]>([]);
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const itemMap = useMemo(() => {
    const map = new Map<string, WeekMenuItem>();
    for (const it of items) {
      map.set(`${it.day_of_week}:${it.meal_slot}`, it);
    }
    return map;
  }, [items]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { user }
      } = await supabaseBrowser.auth.getUser();
      if (!user) throw new Error("Please sign in first.");

      const [menuRes, recipesRes] = await Promise.all([
        fetch(`/api/weekmenu?userId=${encodeURIComponent(user.id)}`),
        fetch(`/api/recipes?meal_type=dinner&userId=${encodeURIComponent(user.id)}`)
      ]);

      const menuData = await menuRes.json();
      if (!menuRes.ok) throw new Error(menuData.error || "Failed to load menu");

      const recipesData = await recipesRes.json();
      if (!recipesRes.ok)
        throw new Error(recipesData.error || "Failed to load recipes");

      setWeekStart(menuData.week_start);
      setItems(menuData.items ?? []);
      setRecipes(
        (recipesData.recipes ?? []).map((r: any) => ({ id: r.id, title: r.title, servings: r.servings }))
      );
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateDinner = async (
    day: number,
    recipeId: number | null,
    plannedServings?: number | null
  ) => {
    const key = `${day}:${WEEKMENU_SLOT}`;
    setSavingKey(key);
    setError(null);
    try {
      const {
        data: { user }
      } = await supabaseBrowser.auth.getUser();
      if (!user) throw new Error("Please sign in first.");

      const res = await fetch("/api/weekmenu", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week_start: weekStart || undefined,
          userId: user.id,
          day_of_week: day,
          recipe_id: recipeId,
          planned_servings: recipeId ? plannedServings ?? null : null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");

      setItems((prev) =>
        prev.map((it) =>
          it.day_of_week === day && it.meal_slot === WEEKMENU_SLOT ? data.item : it
        )
      );
    } catch (e: any) {
      setError(e?.message || "Failed to save");
    } finally {
      setSavingKey(null);
    }
  };

  const updatePortions = async (day: number, portions: number) => {
    const currentItem = itemMap.get(`${day}:${WEEKMENU_SLOT}`);
    if (!currentItem?.recipe_id) return;
    await updateDinner(day, currentItem.recipe_id, Math.max(1, portions));
  };

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const {
        data: { user }
      } = await supabaseBrowser.auth.getUser();
      if (!user) throw new Error("Please sign in first.");

      const res = await fetch("/api/weekmenu/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week_start: weekStart || undefined, userId: user.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate");
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to generate");
    } finally {
      setGenerating(false);
    }
  };

  const replaceDinner = async (day: number) => {
    const key = `${day}:${WEEKMENU_SLOT}`;
    setSavingKey(key);
    setError(null);
    try {
      const {
        data: { user }
      } = await supabaseBrowser.auth.getUser();
      if (!user) throw new Error("Please sign in first.");

      const res = await fetch("/api/weekmenu/replace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week_start: weekStart || undefined, userId: user.id, day_of_week: day })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to replace");
      setItems((prev) =>
        prev.map((it) =>
          it.day_of_week === day && it.meal_slot === WEEKMENU_SLOT ? data.item : it
        )
      );
    } catch (e: any) {
      setError(e?.message || "Failed to replace");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-4">
      <motion.section
        className="rounded-lg bg-white p-4 shadow-sm"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Week menu (dinner)</h2>
            <p className="text-sm text-slate-600">
              Dinner plan for the week starting{" "}
              <span className="font-medium">{weekStart || "..."}</span>
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <motion.a
              href="/shopping-list"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
              whileTap={{ scale: 0.97 }}
            >
              Shopping list
            </motion.a>
            <motion.button
              type="button"
              onClick={generate}
              disabled={generating || loading}
              className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              whileTap={{ scale: 0.97 }}
            >
              {generating ? "Generating…" : "Auto-pick dinners"}
            </motion.button>
            <motion.button
              type="button"
              onClick={load}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
              whileTap={{ scale: 0.97 }}
            >
              Refresh
            </motion.button>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {loading && <p className="mt-2 text-sm text-slate-600">Loading...</p>}
      </motion.section>

      <div className="grid gap-4">
        {WEEK_DAYS.map((day) => (
          <motion.section
            key={day.idx}
            className="rounded-lg bg-white p-4 shadow-sm"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h3 className="text-base font-semibold">{day.label}</h3>
              <div className="flex gap-2">
                <motion.button
                  type="button"
                  onClick={() => replaceDinner(day.idx)}
                  disabled={savingKey === `${day.idx}:${WEEKMENU_SLOT}`}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  whileTap={{ scale: 0.97 }}
                >
                  Not feeling it → swap
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => updateDinner(day.idx, null, null)}
                  disabled={savingKey === `${day.idx}:${WEEKMENU_SLOT}`}
                  className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  whileTap={{ scale: 0.97 }}
                >
                  Clear
                </motion.button>
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[1fr,220px] md:items-end">
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Dinner
                </div>
                <div className="relative">
                  {(() => {
                    const it = itemMap.get(`${day.idx}:${WEEKMENU_SLOT}`);
                    const current = it?.recipe_id ?? null;
                    const currentPortions = it?.planned_servings ?? null;
                    const isSaving = savingKey === `${day.idx}:${WEEKMENU_SLOT}`;
                    return (
                      <>
                        <select
                          value={current ?? ""}
                          onChange={(e) => {
                            const nextId = e.target.value ? Number(e.target.value) : null;
                            const recipe = recipes.find((r) => r.id === nextId);
                            updateDinner(day.idx, nextId, recipe?.servings ?? currentPortions ?? 1);
                          }}
                          className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-8 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="">—</option>
                          {recipes.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.title}
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-slate-500">
                          ▾
                        </div>
                        {isSaving && (
                          <p className="mt-1 text-xs text-slate-500">Saving…</p>
                        )}
                        {current && (
                          <div className="mt-2 flex items-center gap-2">
                            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                              Portions
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={currentPortions ?? recipes.find((r) => r.id === current)?.servings ?? 1}
                              onChange={(e) => updatePortions(day.idx, Number(e.target.value) || 1)}
                              className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {(() => {
                const it = itemMap.get(`${day.idx}:${WEEKMENU_SLOT}`);
                const current = it?.recipe_id ?? null;
                if (!current) return null;
                return (
                  <a
                    href={`/recipes/${current}`}
                    className="rounded-md bg-slate-900 px-3 py-2 text-center text-sm font-medium text-white hover:bg-slate-800"
                  >
                    Open recipe
                  </a>
                );
              })()}
            </div>
          </motion.section>
        ))}
      </div>
    </div>
  );
}

