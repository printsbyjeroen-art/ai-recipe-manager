import { notFound } from "next/navigation";
import { supabaseAdmin } from "../../../lib/supabase";
import type { Ingredient, Recipe, Step } from "../../../types/recipe";
import RecipeDetailClient from "./recipe-detail-client";

async function getRecipe(id: string): Promise<Recipe | null> {
  const recipeId = Number(id);
  if (Number.isNaN(recipeId)) return null;

  const { data: recipe, error } = await supabaseAdmin
    .from("recipes")
    .select("*")
    .eq("id", recipeId)
    .single();

  if (error || !recipe) return null;

  const { data: ingredients } = await supabaseAdmin
    .from("ingredients")
    .select("*")
    .eq("recipe_id", recipeId)
    .order("id", { ascending: true });

  const { data: steps } = await supabaseAdmin
    .from("steps")
    .select("*")
    .eq("recipe_id", recipeId)
    .order("step_number", { ascending: true });

  return {
    ...(recipe as any),
    ingredients: (ingredients ?? []) as Ingredient[],
    steps: (steps ?? []) as Step[]
  };
}

export default async function RecipePage({
  params
}: {
  params: { id: string };
}) {
  const recipe = await getRecipe(params.id);
  if (!recipe) notFound();

  return <RecipeDetailClient recipe={recipe} />;
}

