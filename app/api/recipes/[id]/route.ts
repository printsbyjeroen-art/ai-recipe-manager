import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase";
import type { Ingredient, Recipe, Step } from "../../../../types/recipe";

async function getFullRecipe(id: number): Promise<Recipe | null> {
  const { data: recipe, error } = await supabaseAdmin
    .from("recipes")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !recipe) return null;

  const { data: ingredients } = await supabaseAdmin
    .from("ingredients")
    .select("*")
    .eq("recipe_id", id)
    .order("id", { ascending: true });

  const { data: steps } = await supabaseAdmin
    .from("steps")
    .select("*")
    .eq("recipe_id", id)
    .order("step_number", { ascending: true });

  return {
    ...(recipe as any),
    ingredients: (ingredients ?? []) as Ingredient[],
    steps: (steps ?? []) as Step[]
  };
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const recipe = await getFullRecipe(id);
  if (!recipe) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ recipe });
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = (await request.json()) as Recipe;
  const { ingredients, steps, ...recipeFields } = body;

  const { error: recipeError } = await supabaseAdmin
    .from("recipes")
    .update(recipeFields)
    .eq("id", id);

  if (recipeError) {
    return NextResponse.json(
      { error: recipeError.message },
      { status: 500 }
    );
  }

  await supabaseAdmin.from("ingredients").delete().eq("recipe_id", id);
  await supabaseAdmin.from("steps").delete().eq("recipe_id", id);

  if (ingredients?.length) {
    const { error: ingError } = await supabaseAdmin.from("ingredients").insert(
      ingredients.map((i) => ({
        recipe_id: id,
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
    const { error: stepsError } = await supabaseAdmin.from("steps").insert(
      steps.map((s) => ({
        recipe_id: id,
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

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  await supabaseAdmin.from("ingredients").delete().eq("recipe_id", id);
  await supabaseAdmin.from("steps").delete().eq("recipe_id", id);
  const { error } = await supabaseAdmin.from("recipes").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

