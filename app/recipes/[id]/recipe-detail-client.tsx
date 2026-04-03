"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Recipe } from "../../../types/recipe";

interface Props {
  recipe: Recipe;
}

const mealTypes: Recipe["meal_type"][] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "dessert"
];

const dishTypes: Recipe["dish_type"][] = [
  "pasta",
  "rice",
  "soup",
  "salad",
  "wraps",
  "oven dishes",
  "baking",
  "other"
];

export default function RecipeDetailClient({ recipe }: Props) {
  const router = useRouter();

  const [current, setCurrent] = useState<Recipe>(recipe);
  const [draft, setDraft] = useState<Recipe>(recipe);
  const [servings, setServings] = useState<number>(recipe.servings);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scaleFactor = servings / current.servings;

  const handleStartEdit = () => {
    setDraft(current);
    setEditing(true);
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setDraft(current);
    setServings(current.servings);
    setError(null);
  };

  const handleSave = async () => {
    if (!current.id) return;
    setSaving(true);
    setError(null);
    try {
      const payload: Recipe = {
        ...draft,
        id: current.id,
        created_at: current.created_at
      };

      const res = await fetch(`/api/recipes/${current.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save recipe");
      }

      setCurrent(draft);
      setServings(draft.servings);
      setEditing(false);
    } catch (err: any) {
      setError(err.message || "Unexpected error while saving");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!current.id) return;
    if (!window.confirm("Are you sure you want to delete this recipe?")) return;

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/recipes/${current.id}`, {
        method: "DELETE"
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete recipe");
      }

      router.push("/");
    } catch (err: any) {
      setError(err.message || "Unexpected error while deleting");
    } finally {
      setDeleting(false);
    }
  };

  const renderHeader = () => (
    <section className="rounded-lg bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          {editing ? (
            <>
              <input
                type="text"
                value={draft.title}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, title: e.target.value }))
                }
                className="mb-1 w-full rounded-md border border-slate-300 px-2 py-1 text-lg font-semibold"
              />
              <textarea
                value={draft.description}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, description: e.target.value }))
                }
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700"
                rows={3}
              />
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold">{current.title}</h2>
              <p className="text-sm text-slate-600">{current.description}</p>
            </>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 text-sm md:flex-row md:items-center">
          <div className="flex flex-col items-start">
            <span className="text-xs font-medium text-slate-600">Servings</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (editing) {
                    setDraft((prev) => ({
                      ...prev,
                      servings: Math.max(1, prev.servings - 1)
                    }));
                  }
                  setServings((s) => Math.max(1, s - 1));
                }}
                className="h-7 w-7 rounded-full border border-slate-300 text-sm hover:bg-slate-50"
              >
                -
              </button>
              <input
                type="number"
                className="w-14 rounded-md border border-slate-300 px-2 py-1 text-center text-sm"
                min={1}
                value={editing ? draft.servings : servings}
                onChange={(e) => {
                  const value = Math.max(1, Number(e.target.value) || 1);
                  if (editing) {
                    setDraft((prev) => ({ ...prev, servings: value }));
                  }
                  setServings(value);
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (editing) {
                    setDraft((prev) => ({
                      ...prev,
                      servings: prev.servings + 1
                    }));
                  }
                  setServings((s) => s + 1);
                }}
                className="h-7 w-7 rounded-full border border-slate-300 text-sm hover:bg-slate-50"
              >
                +
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!editing && (
              <a
                href={`/recipes/${current.id}/cook`}
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Cooking mode
              </a>
            )}
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={saving}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleStartEdit}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
        {editing ? (
          <>
            <select
              value={draft.meal_type}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  meal_type: e.target.value as Recipe["meal_type"]
                }))
              }
              className="rounded-full border border-slate-300 bg-white px-2 py-0.5"
            >
              {mealTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={draft.dish_type}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  dish_type: e.target.value as Recipe["dish_type"]
                }))
              }
              className="rounded-full border border-slate-300 bg-white px-2 py-0.5"
            >
              {dishTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5">
              <input
                type="number"
                className="w-12 rounded-md border border-slate-300 px-1 py-0.5 text-right"
                min={0}
                value={draft.prep_time}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    prep_time: Math.max(0, Number(e.target.value) || 0)
                  }))
                }
              />
              <span className="text-[10px] text-slate-600">prep</span>
              <span>+</span>
              <input
                type="number"
                className="w-12 rounded-md border border-slate-300 px-1 py-0.5 text-right"
                min={0}
                value={draft.cook_time}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    cook_time: Math.max(0, Number(e.target.value) || 0)
                  }))
                }
              />
              <span className="text-[10px] text-slate-600">cook min</span>
            </div>
            <div className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5">
              <input
                type="number"
                className="w-16 rounded-md border border-slate-300 px-1 py-0.5 text-right"
                min={0}
                value={draft.calories_per_serving}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    calories_per_serving: Math.max(0, Number(e.target.value) || 0)
                  }))
                }
              />
              <span className="text-[10px] text-slate-600">kcal/serv</span>
            </div>
          </>
        ) : (
          <>
            <span className="rounded-full bg-blue-50 px-2 py-0.5">
              {current.meal_type}
            </span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5">
              {current.dish_type}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5">
              {current.prep_time + current.cook_time} min
            </span>
            <span className="rounded-full bg-amber-50 px-2 py-0.5">
              {Math.round(current.calories_per_serving || 0)} kcal/serving
            </span>
          </>
        )}
        {current.source_url && !editing && (
          <a
            href={current.source_url}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-slate-100 px-2 py-0.5 underline"
          >
            Original source
          </a>
        )}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3 text-xs text-slate-700">
        {editing ? (
          <>
            <label className="flex items-center justify-between gap-2 rounded bg-slate-100 px-2 py-1">
              <span>Protein (g)</span>
              <input
                type="number"
                className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right"
                min={0}
                step={0.1}
                value={draft.protein_g}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    protein_g: Math.max(0, Number(e.target.value) || 0)
                  }))
                }
              />
            </label>
            <label className="flex items-center justify-between gap-2 rounded bg-slate-100 px-2 py-1">
              <span>Carbs (g)</span>
              <input
                type="number"
                className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right"
                min={0}
                step={0.1}
                value={draft.carbs_g}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    carbs_g: Math.max(0, Number(e.target.value) || 0)
                  }))
                }
              />
            </label>
            <label className="flex items-center justify-between gap-2 rounded bg-slate-100 px-2 py-1">
              <span>Fat (g)</span>
              <input
                type="number"
                className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right"
                min={0}
                step={0.1}
                value={draft.fat_g}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    fat_g: Math.max(0, Number(e.target.value) || 0)
                  }))
                }
              />
            </label>
          </>
        ) : (
          <>
            <span className="rounded bg-slate-100 px-2 py-1 text-center">
              Protein: {Number(current.protein_g || 0).toFixed(1)}g
            </span>
            <span className="rounded bg-slate-100 px-2 py-1 text-center">
              Carbs: {Number(current.carbs_g || 0).toFixed(1)}g
            </span>
            <span className="rounded bg-slate-100 px-2 py-1 text-center">
              Fat: {Number(current.fat_g || 0).toFixed(1)}g
            </span>
          </>
        )}
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </section>
  );

  const renderIngredients = () => (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
        Ingredients
      </h3>
      <ul className="space-y-1 text-sm">
        {(editing ? draft.ingredients : current.ingredients).map((ing, idx) => (
          <li key={idx} className="flex items-baseline gap-2">
            {editing ? (
              <>
                <input
                  type="number"
                  className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
                  value={ing.amount}
                  onChange={(e) => {
                    const value = Number(e.target.value) || 0;
                    setDraft((prev) => ({
                      ...prev,
                      ingredients: prev.ingredients.map((item, i) =>
                        i === idx ? { ...item, amount: value } : item
                      )
                    }));
                  }}
                />
                <input
                  type="text"
                  className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  value={ing.unit}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDraft((prev) => ({
                      ...prev,
                      ingredients: prev.ingredients.map((item, i) =>
                        i === idx ? { ...item, unit: value } : item
                      )
                    }));
                  }}
                />
                <input
                  type="text"
                  className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  value={ing.name}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDraft((prev) => ({
                      ...prev,
                      ingredients: prev.ingredients.map((item, i) =>
                        i === idx ? { ...item, name: value } : item
                      )
                    }));
                  }}
                />
              </>
            ) : (
              <>
                <span className="w-24 text-right font-medium tabular-nums">
                  {(ing.amount * scaleFactor).toFixed(2).replace(/\.00$/, "")}{" "}
                  {ing.unit}
                </span>
                <span className="text-slate-800">{ing.name}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );

  const renderSteps = () => (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
        Steps
      </h3>
      <ol className="space-y-2 text-sm">
        {(editing ? draft.steps : current.steps).map((step, idx) => (
          <li key={step.step_number ?? idx} className="flex gap-2">
            <span className="mt-0.5 h-5 w-5 flex-shrink-0 rounded-full bg-slate-900 text-center text-xs font-semibold text-white">
              {step.step_number}
            </span>
            {editing ? (
              <textarea
                className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-800"
                value={step.instruction}
                rows={2}
                onChange={(e) => {
                  const value = e.target.value;
                  setDraft((prev) => ({
                    ...prev,
                    steps: prev.steps.map((item, i) =>
                      i === idx ? { ...item, instruction: value } : item
                    )
                  }));
                }}
              />
            ) : (
              <p className="text-slate-800">{step.instruction}</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );

  return (
    <div className="space-y-4">
      {renderHeader()}
      <section className="grid gap-4 md:grid-cols-[1.1fr,1.2fr]">
        {renderIngredients()}
        {renderSteps()}
      </section>
    </div>
  );
}

