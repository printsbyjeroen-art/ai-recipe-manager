"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { MealType, DishType, Recipe } from "../types/recipe";
import RecipeModal from "./RecipeModal";
import { supabaseBrowser } from "../lib/supabase";

interface RecipeSummary extends Omit<Recipe, "ingredients" | "steps"> {}

const mealTypes: (MealType | "all")[] = [
  "all",
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "dessert"
];

const dishTypes: (DishType | "all")[] = [
  "all",
  "pasta",
  "rice",
  "soup",
  "salad",
  "wraps",
  "oven dishes",
  "baking",
  "other"
];

export default function DashboardPage() {
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [search, setSearch] = useState("");
  const [mealType, setMealType] = useState<MealType | "all">("all");
  const [dishType, setDishType] = useState<DishType | "all">("all");
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);

  const getUserId = async () => {
    const {
      data: { user }
    } = await supabaseBrowser.auth.getUser();
    return user?.id ?? null;
  };

  const fetchRecipes = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (mealType !== "all") params.set("meal_type", mealType);
    if (dishType !== "all") params.set("dish_type", dishType);

    const userId = await getUserId();
    if (!userId) {
      setRecipes([]);
      setLoading(false);
      return;
    }
    params.set("userId", userId);

    const res = await fetch(`/api/recipes?${params.toString()}`);
    const data = await res.json();
    setRecipes(data.recipes ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchRecipes();
  }, [search, mealType, dishType]);

  const handleAddRecipe = () => {
    setEditingRecipe(null);
    setModalOpen(true);
  };

  const handleEditRecipe = (recipe: RecipeSummary) => {
    // Fetch full recipe for editing
    fetch(`/api/recipes/${recipe.id}`)
      .then(res => res.json())
      .then(data => {
        setEditingRecipe(data.recipe);
        setModalOpen(true);
      });
  };

  const handleDeleteRecipe = async (id: number) => {
    if (!confirm("Are you sure you want to delete this recipe?")) return;
    await fetch(`/api/recipes/${id}`, { method: "DELETE" });
    fetchRecipes();
  };

  const handleSaveRecipe = async (recipe: Recipe) => {
    const userId = await getUserId();
    if (!userId) return;

    const method = editingRecipe ? "PUT" : "POST";
    const url = editingRecipe ? `/api/recipes/${editingRecipe.id}` : "/api/recipes";
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...recipe, userId })
    });
    setModalOpen(false);
    fetchRecipes();
  };

  const groupedRecipes = recipes.reduce((acc, recipe) => {
    if (!acc[recipe.meal_type]) acc[recipe.meal_type] = [];
    acc[recipe.meal_type].push(recipe);
    return acc;
  }, {} as Record<MealType, RecipeSummary[]>);

  return (
    <div className="space-y-4">
      <motion.section
        className="rounded-lg bg-white p-4 shadow-sm"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your recipes</h2>
          <motion.button
            onClick={handleAddRecipe}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
            whileHover={{ scale: 1.04, boxShadow: "0 10px 18px rgba(37,99,235,0.35)" }}
            whileTap={{ scale: 0.95 }}
          >
            Add Recipe
          </motion.button>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Search
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title or description..."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-1 gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Meal type
              </label>
              <select
                value={mealType}
                onChange={(e) => setMealType(e.target.value as MealType | "all")}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {mealTypes.map((t) => (
                  <option key={t} value={t}>
                    {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Dish type
              </label>
              <select
                value={dishType}
                onChange={(e) => setDishType(e.target.value as DishType | "all")}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {dishTypes.map((t) => (
                  <option key={t} value={t}>
                    {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </motion.section>

      <section className="space-y-6">
        {loading ? (
          <motion.p
            className="text-sm text-slate-600"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            Loading recipes...
          </motion.p>
        ) : recipes.length === 0 ? (
          <motion.div
            className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            No recipes yet. Try adding one manually or importing from a URL.
          </motion.div>
        ) : (
          Object.entries(groupedRecipes).map(([mealType, recipesInType]) => (
            <div key={mealType}>
              <h3 className="mb-3 text-lg font-semibold capitalize">{mealType}</h3>
              <ul className="grid gap-4 md:grid-cols-2">
                <AnimatePresence>
                  {recipesInType.map((recipe) => (
                    <motion.li
                      key={recipe.id}
                      className="flex flex-col rounded-lg bg-white p-4 shadow-sm"
                      initial={{ opacity: 0, y: 10, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.97 }}
                      transition={{ duration: 0.25 }}
                      whileHover={{ translateY: -4, boxShadow: "0 18px 32px rgba(15,23,42,0.18)" }}
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <h4 className="text-base font-semibold">{recipe.title}</h4>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                          {recipe.servings} servings
                        </span>
                      </div>
                      <p className="mb-2 line-clamp-2 text-xs text-slate-600">
                        {recipe.description}
                      </p>
                      <div className="mb-3 flex flex-wrap gap-2 text-[11px] text-slate-600">
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5">
                          {recipe.dish_type}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5">
                          {recipe.prep_time + recipe.cook_time} min
                        </span>
                        <span className="rounded-full bg-amber-50 px-2 py-0.5">
                          {Math.round(recipe.calories_per_serving || 0)} kcal/serving
                        </span>
                      </div>
                      <div className="mb-3 grid grid-cols-3 gap-1 text-[11px] text-slate-600">
                        <span className="rounded bg-slate-100 px-2 py-1 text-center">
                          P {Number(recipe.protein_g || 0).toFixed(1)}g
                        </span>
                        <span className="rounded bg-slate-100 px-2 py-1 text-center">
                          C {Number(recipe.carbs_g || 0).toFixed(1)}g
                        </span>
                        <span className="rounded bg-slate-100 px-2 py-1 text-center">
                          F {Number(recipe.fat_g || 0).toFixed(1)}g
                        </span>
                      </div>
                      <div className="mt-auto flex gap-2 text-sm">
                        <motion.a
                          href={`/recipes/${recipe.id}`}
                          className="flex-1 rounded-md bg-slate-900 px-3 py-2 text-center text-white hover:bg-slate-800"
                          whileTap={{ scale: 0.96 }}
                        >
                          View
                        </motion.a>
                        <motion.a
                          href={`/recipes/${recipe.id}/cook`}
                          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-center hover:bg-slate-50"
                          whileTap={{ scale: 0.96 }}
                        >
                          Cook
                        </motion.a>
                        <motion.button
                          onClick={() => handleEditRecipe(recipe)}
                          className="rounded-md border border-blue-300 px-3 py-2 text-center text-blue-600 hover:bg-blue-50"
                          whileTap={{ scale: 0.96 }}
                        >
                          Edit
                        </motion.button>
                        <motion.button
                          onClick={() => handleDeleteRecipe(recipe.id!)}
                          className="rounded-md border border-red-300 px-3 py-2 text-center text-red-600 hover:bg-red-50"
                          whileTap={{ scale: 0.96 }}
                        >
                          Delete
                        </motion.button>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </div>
          ))
        )}
      </section>

      {modalOpen && (
        <RecipeModal
          recipe={editingRecipe}
          onClose={() => setModalOpen(false)}
          onSave={handleSaveRecipe}
        />
      )}
    </div>
  );
}

