"use client";

import { useState, useEffect } from "react";
import type { Recipe, Ingredient, Step, MealType, DishType } from "../types/recipe";

interface RecipeModalProps {
  recipe: Recipe | null;
  onClose: () => void;
  onSave: (recipe: Recipe) => void;
}

const mealTypes: MealType[] = ["breakfast", "lunch", "dinner", "snack", "dessert"];
const dishTypes: DishType[] = ["pasta", "rice", "soup", "salad", "wraps", "oven dishes", "baking", "other"];

export default function RecipeModal({ recipe, onClose, onSave }: RecipeModalProps) {
  const [form, setForm] = useState<Recipe>({
    title: "",
    description: "",
    servings: 1,
    meal_type: "dinner",
    dish_type: "other",
    prep_time: 0,
    cook_time: 0,
    source_url: "",
    ingredients: [],
    steps: []
  });

  useEffect(() => {
    if (recipe) {
      setForm(recipe);
    } else {
      setForm({
        title: "",
        description: "",
        servings: 1,
        meal_type: "dinner",
        dish_type: "other",
        prep_time: 0,
        cook_time: 0,
        source_url: "",
        ingredients: [],
        steps: []
      });
    }
  }, [recipe]);

  const updateForm = (field: keyof Recipe, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const addIngredient = () => {
    setForm(prev => ({
      ...prev,
      ingredients: [...prev.ingredients, { name: "", amount: 0, unit: "" }]
    }));
  };

  const updateIngredient = (index: number, field: keyof Ingredient, value: any) => {
    setForm(prev => ({
      ...prev,
      ingredients: prev.ingredients.map((ing, i) =>
        i === index ? { ...ing, [field]: value } : ing
      )
    }));
  };

  const removeIngredient = (index: number) => {
    setForm(prev => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== index)
    }));
  };

  const addStep = () => {
    setForm(prev => ({
      ...prev,
      steps: [...prev.steps, { step_number: prev.steps.length + 1, instruction: "" }]
    }));
  };

  const updateStep = (index: number, instruction: string) => {
    setForm(prev => ({
      ...prev,
      steps: prev.steps.map((step, i) =>
        i === index ? { ...step, instruction } : step
      )
    }));
  };

  const removeStep = (index: number) => {
    setForm(prev => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== index).map((step, i) => ({ ...step, step_number: i + 1 }))
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{recipe ? "Edit Recipe" : "Add Recipe"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">×</button>
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
                {mealTypes.map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
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
                {dishTypes.map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
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
              <button type="button" onClick={addIngredient} className="text-blue-600 text-sm">+ Add</button>
            </div>
            {form.ingredients.map((ing, index) => (
              <div key={index} className="mb-2 flex gap-2">
                <input
                  type="text"
                  placeholder="Name"
                  value={ing.name}
                  onChange={(e) => updateIngredient(index, "name", e.target.value)}
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  placeholder="Amount"
                  value={ing.amount}
                  onChange={(e) => updateIngredient(index, "amount", Number(e.target.value))}
                  step="0.01"
                  className="w-20 rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  placeholder="Unit"
                  value={ing.unit}
                  onChange={(e) => updateIngredient(index, "unit", e.target.value)}
                  className="w-20 rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <button type="button" onClick={() => removeIngredient(index)} className="text-red-600">×</button>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium">Steps</label>
              <button type="button" onClick={addStep} className="text-blue-600 text-sm">+ Add</button>
            </div>
            {form.steps.map((step, index) => (
              <div key={index} className="mb-2 flex gap-2">
                <span className="text-sm text-slate-600 w-6">{step.step_number}.</span>
                <input
                  type="text"
                  placeholder="Instruction"
                  value={step.instruction}
                  onChange={(e) => updateStep(index, e.target.value)}
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <button type="button" onClick={() => removeStep(index)} className="text-red-600">×</button>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600">Cancel</button>
            <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
              {recipe ? "Update" : "Create"} Recipe
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}