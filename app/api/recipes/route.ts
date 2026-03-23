import { NextResponse } from "next/server";
import { supabaseBrowser } from "../../../lib/supabase";
import type { Recipe } from "../../../types/recipe";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const mealType = searchParams.get("meal_type");
  const dishType = searchParams.get("dish_type");

  let query = supabaseBrowser.from("recipes").select("*").order("created_at", {
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
  const body = (await request.json()) as Recipe;

  const { ingredients, steps, ...recipeFields } = body;

  const { data: userResult } = await supabaseBrowser.auth.getUser();
  const user = userResult?.user;
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: recipe, error } = await supabaseBrowser
    .from("recipes")
    .insert({
      user_id: user.id,
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
    const { error: ingError } = await supabaseBrowser.from("ingredients").insert(
      ingredients.map((i) => ({
        recipe_id: recipeId,
        name: i.name,
        amount: i.amount,
        unit: i.unit
      }))
    );
    if (ingError) {
      return NextResponse.json(
        { error: ingError.message },
        { status: 500 }
      );
    }
  }

  if (steps?.length) {
    const { error: stepsError } = await supabaseBrowser.from("steps").insert(
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

