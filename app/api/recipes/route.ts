import { NextResponse } from "next/server";
import { guessStoreSection, normalizeStoreSection } from "../../../lib/ingredients";
import { supabaseAdmin } from "../../../lib/supabase";
import type { Recipe } from "../../../types/recipe";

function isMissingIngredientProfileColumnError(error: any) {
  const message = String(error?.message ?? "").toLowerCase();
  return (
    message.includes("store_section") ||
    message.includes("calories_per_100g") ||
    message.includes("protein_g_per_100g") ||
    message.includes("carbs_g_per_100g") ||
    message.includes("fat_g_per_100g")
  );
}

async function insertRecipeIngredients(recipeId: number, ingredients: Recipe["ingredients"] = []) {
  if (!ingredients.length) {
    return null;
  }

  let { error } = await supabaseAdmin.from("ingredients").insert(
    ingredients.map((i) => ({
      recipe_id: recipeId,
      name: i.name,
      amount: i.amount,
      unit: i.unit,
      store_section: normalizeStoreSection(i.store_section || guessStoreSection(i.name)),
      calories_per_100g: Math.max(0, Number(i.calories_per_100g) || 0),
      protein_g_per_100g: Math.max(0, Number(i.protein_g_per_100g) || 0),
      carbs_g_per_100g: Math.max(0, Number(i.carbs_g_per_100g) || 0),
      fat_g_per_100g: Math.max(0, Number(i.fat_g_per_100g) || 0)
    }))
  );

  if (error && isMissingIngredientProfileColumnError(error)) {
    const fallback = await supabaseAdmin.from("ingredients").insert(
      ingredients.map((i) => ({
        recipe_id: recipeId,
        name: i.name,
        amount: i.amount,
        unit: i.unit
      }))
    );
    error = fallback.error;
  }

  return error;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const search = searchParams.get("search");
  const mealType = searchParams.get("meal_type");
  const dishType = searchParams.get("dish_type");

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  let query = supabaseAdmin
    .from("recipes")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", {
      ascending: false
    });

  if (search) {
    query = query.or(
      `title.ilike.%${search}%,description.ilike.%${search}%`
    ) as any;
  }

  if (mealType) {
    query = query.eq("meal_type", mealType);
  }
  if (dishType) {
    query = query.eq("dish_type", dishType);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ recipes: data });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Recipe & { userId?: string };

  if (!body.userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const { ingredients, steps, userId, ...recipeFields } = body;

  const { data: recipe, error } = await supabaseAdmin
    .from("recipes")
    .insert({
      user_id: userId,
      ...recipeFields
    })
    .select("*")
    .single();

  if (error || !recipe) {
    return NextResponse.json(
      { error: error?.message || "Failed to create recipe" },
      { status: 500 }
    );
  }

  const recipeId = recipe.id;

  if (ingredients?.length) {
    const ingError = await insertRecipeIngredients(recipeId, ingredients);
    if (ingError) {
      return NextResponse.json(
        { error: ingError.message },
        { status: 500 }
      );
    }
  }

  if (steps?.length) {
    const { error: stepsError } = await supabaseAdmin.from("steps").insert(
      steps.map((s) => ({
        recipe_id: recipeId,
        step_number: s.step_number,
        instruction: s.instruction
      }))
    );
    if (stepsError) {
      return NextResponse.json(
        { error: stepsError.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ id: recipeId });
}

