"use client";

import { useEffect, useState } from "react";
import type { Recipe } from "../../../../types/recipe";

async function fetchRecipe(id: string): Promise<Recipe | null> {
  const res = await fetch(`/api/recipes/${id}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.recipe ?? null;
}

export default function CookingModePage({
  params
}: {
  params: { id: string };
}) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [checkedIngredients, setCheckedIngredients] = useState<
    Record<number, boolean>
  >({});
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>(
    {}
  );

  useEffect(() => {
    fetchRecipe(params.id).then((r) => {
      if (r) setRecipe(r);
    });
  }, [params.id]);

  if (!recipe) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-600">
        Loading recipe...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <header className="sticky top-0 z-10 bg-slate-50/95 pb-2 pt-1 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">{recipe.title}</h2>
            <p className="text-xs text-slate-600">
              Cooking mode · {recipe.prep_time + recipe.cook_time} min
            </p>
          </div>
          <a
            href={`/recipes/${recipe.id}`}
            className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100"
          >
            Exit
          </a>
        </div>
      </header>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-base font-semibold">Ingredients</h3>
        <ul className="space-y-2">
          {recipe.ingredients.map((ing, index) => (
            <li key={index} className="flex items-start gap-2 text-base">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 rounded border-slate-300"
                checked={!!checkedIngredients[index]}
                onChange={() =>
                  setCheckedIngredients((prev) => ({
                    ...prev,
                    [index]: !prev[index]
                  }))
                }
              />
              <span
                className={
                  checkedIngredients[index]
                    ? "text-slate-400 line-through"
                    : "text-slate-900"
                }
              >
                <span className="font-medium">
                  {ing.amount} {ing.unit}
                </span>{" "}
                {ing.name}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-base font-semibold">Steps</h3>
        <ol className="space-y-3">
          {recipe.steps.map((step) => (
            <li key={step.step_number} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">
                  Step {step.step_number}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCompletedSteps((prev) => ({
                      ...prev,
                      [step.step_number]: !prev[step.step_number]
                    }))
                  }
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    completedSteps[step.step_number]
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {completedSteps[step.step_number] ? "Completed" : "Mark done"}
                </button>
              </div>
              <p
                className={`text-lg leading-relaxed ${
                  completedSteps[step.step_number]
                    ? "text-slate-400 line-through"
                    : "text-slate-900"
                }`}
              >
                {step.instruction}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

