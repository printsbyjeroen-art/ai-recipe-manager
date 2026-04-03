"use client";

import { useEffect, useState } from "react";
import { displayStoreSection, normalizeIngredientName, STORE_SECTIONS } from "../lib/ingredients";
import { supabaseBrowser } from "../lib/supabase";
import type { DishType, Ingredient, MealType, Recipe } from "../types/recipe";

interface RecipeModalProps {
  recipe: Recipe | null;
  onClose: () => void;
  onSave: (recipe: Recipe) => void;
}

type IngredientProfile = {
  normalized_name: string;
  default_unit: string;
  store_section: string;
  calories_per_100g: number;
  protein_g_per_100g: number;
  carbs_g_per_100g: number;
  fat_g_per_100g: number;
};

const mealTypes: MealType[] = ["breakfast", "lunch", "dinner", "snack", "dessert"];
const dishTypes: DishType[] = ["pasta", "rice", "soup", "salad", "wraps", "oven dishes", "baking", "other"];

function emptyRecipe(): Recipe {
  return {
    title: "",
    description: "",
    servings: 1,
    calories_per_serving: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    meal_type: "dinner",
    dish_type: "other",
    prep_time: 0,
    cook_time: 0,
    source_url: "",
    ingredients: [],
    steps: []
  };
}

export default function RecipeModal({ recipe, onClose, onSave }: RecipeModalProps) {
  const [form, setForm] = useState<Recipe>(emptyRecipe());
  const [ingredientProfiles, setIngredientProfiles] = useState<Record<string, IngredientProfile>>({});

  useEffect(() => {
    if (recipe) {
      setForm({
        ...recipe,
        ingredients: (recipe.ingredients ?? []).map((ingredient) => ({
          ...ingredient,
          store_section: ingredient.store_section || "miscellaneous"
        }))
      });
    } else {
      setForm(emptyRecipe());
    }
  }, [recipe]);

  useEffect(() => {
    const loadProfiles = async () => {
      try {
        const {
          data: { user }
        } = await supabaseBrowser.auth.getUser();

        if (!user) return;

        const res = await fetch(`/api/ingredients?userId=${encodeURIComponent(user.id)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return;

        const map: Record<string, IngredientProfile> = {};
        for (const item of data.ingredients ?? []) {
          map[item.normalized_name] = item;
        }
        setIngredientProfiles(map);
      } catch {
        // Ignore profile prefill errors in the modal.
      }
    };

    loadProfiles();
  }, []);

  const updateForm = (field: keyof Recipe, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const addIngredient = () => {
    setForm((prev) => ({
      ...prev,
      ingredients: [
        ...prev.ingredients,
        {
          name: "",
          amount: 0,
          unit: "",
          store_section: "miscellaneous",
          calories_per_100g: 0,
          protein_g_per_100g: 0,
          carbs_g_per_100g: 0,
          fat_g_per_100g: 0
        }
      ]
    }));
  };

  const updateIngredient = (index: number, field: keyof Ingredient, value: any) => {
    setForm((prev) => {
      const nextIngredients = prev.ingredients.map((ingredient, ingredientIndex) => {
        if (ingredientIndex !== index) {
          return ingredient;
        }

        const updated = { ...ingredient, [field]: value };

        if (field === "name") {
          const hint = ingredientProfiles[normalizeIngredientName(String(value))];
          if (hint) {
            updated.store_section = updated.store_section || hint.store_section || "miscellaneous";
            updated.unit = updated.unit || hint.default_unit || "";
            updated.calories_per_100g = Number(updated.calories_per_100g) || hint.calories_per_100g || 0;
            updated.protein_g_per_100g = Number(updated.protein_g_per_100g) || hint.protein_g_per_100g || 0;
            updated.carbs_g_per_100g = Number(updated.carbs_g_per_100g) || hint.carbs_g_per_100g || 0;
            updated.fat_g_per_100g = Number(updated.fat_g_per_100g) || hint.fat_g_per_100g || 0;
          } else if (!updated.store_section) {
            updated.store_section = "miscellaneous";
          }
        }

        return updated;
      });

      return { ...prev, ingredients: nextIngredients };
    });
  };

  const removeIngredient = (index: number) => {
    setForm((prev) => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, ingredientIndex) => ingredientIndex !== index)
    }));
  };

  const addStep = () => {
    setForm((prev) => ({
      ...prev,
      steps: [...prev.steps, { step_number: prev.steps.length + 1, instruction: "" }]
    }));
  };

  const updateStep = (index: number, instruction: string) => {
    setForm((prev) => ({
      ...prev,
      steps: prev.steps.map((step, stepIndex) =>
        stepIndex === index ? { ...step, instruction } : step
      )
    }));
  };

  const removeStep = (index: number) => {
    setForm((prev) => ({
      ...prev,
      steps: prev.steps
        .filter((_, stepIndex) => stepIndex !== index)
        .map((step, stepIndex) => ({ ...step, step_number: stepIndex + 1 }))
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...form,
      ingredients: form.ingredients.map((ingredient) => ({
        ...ingredient,
        store_section: ingredient.store_section || "miscellaneous"
      }))
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-3 py-6">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{recipe ? "Edit Recipe" : "Add Recipe"}</h3>
          <button onClick={onClose} className="text-2xl leading-none text-slate-400 hover:text-slate-600">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => updateForm("title", e.target.value)}
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => updateForm("description", e.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Servings</label>
              <input
                type="number"
                value={form.servings}
                onChange={(e) => updateForm("servings", Number(e.target.value))}
                min="1"
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Meal Type</label>
              <select
                value={form.meal_type}
                onChange={(e) => updateForm("meal_type", e.target.value as MealType)}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              >
                {mealTypes.map((type) => (
                  <option key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Dish Type</label>
              <select
                value={form.dish_type}
                onChange={(e) => updateForm("dish_type", e.target.value as DishType)}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              >
                {dishTypes.map((type) => (
                  <option key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Prep Time (min)</label>
              <input
                type="number"
                value={form.prep_time}
                onChange={(e) => updateForm("prep_time", Number(e.target.value))}
                min="0"
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Calories per serving</label>
              <input
                type="number"
                value={form.calories_per_serving}
                onChange={(e) => updateForm("calories_per_serving", Number(e.target.value))}
                min="0"
                step="1"
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Protein (g)</label>
              <input
                type="number"
                value={form.protein_g}
                onChange={(e) => updateForm("protein_g", Number(e.target.value))}
                min="0"
                step="0.1"
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Carbs (g)</label>
              <input
                type="number"
                value={form.carbs_g}
                onChange={(e) => updateForm("carbs_g", Number(e.target.value))}
                min="0"
                step="0.1"
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Fat (g)</label>
              <input
                type="number"
                value={form.fat_g}
                onChange={(e) => updateForm("fat_g", Number(e.target.value))}
                min="0"
                step="0.1"
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Cook Time (min)</label>
              <input
                type="number"
                value={form.cook_time}
                onChange={(e) => updateForm("cook_time", Number(e.target.value))}
                min="0"
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Source URL</label>
              <input
                type="url"
                value={form.source_url}
                onChange={(e) => updateForm("source_url", e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium">Ingredients</label>
              <button type="button" onClick={addIngredient} className="text-sm text-blue-600">
                + Add
              </button>
            </div>

            <div className="space-y-2">
              {form.ingredients.map((ingredient, index) => (
                <div key={index} className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1.4fr_110px_110px_170px_auto]">
                  <input
                    type="text"
                    placeholder="Name"
                    value={ingredient.name}
                    onChange={(e) => updateIngredient(index, "name", e.target.value)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Amount"
                    value={ingredient.amount}
                    onChange={(e) => updateIngredient(index, "amount", Number(e.target.value))}
                    step="0.01"
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Unit"
                    value={ingredient.unit}
                    onChange={(e) => updateIngredient(index, "unit", e.target.value)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  <select
                    value={ingredient.store_section || "miscellaneous"}
                    onChange={(e) => updateIngredient(index, "store_section", e.target.value)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    {STORE_SECTIONS.map((section) => (
                      <option key={section} value={section}>
                        {displayStoreSection(section)}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => removeIngredient(index)} className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium">Steps</label>
              <button type="button" onClick={addStep} className="text-sm text-blue-600">
                + Add
              </button>
            </div>
            {form.steps.map((step, index) => (
              <div key={index} className="mb-2 flex gap-2">
                <span className="w-6 pt-2 text-sm text-slate-600">{step.step_number}.</span>
                <input
                  type="text"
                  placeholder="Instruction"
                  value={step.instruction}
                  onChange={(e) => updateStep(index, e.target.value)}
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <button type="button" onClick={() => removeStep(index)} className="text-red-600">
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600">
              Cancel
            </button>
            <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
              {recipe ? "Update" : "Create"} Recipe
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}