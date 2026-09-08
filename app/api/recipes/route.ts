import { NextResponse } from "next/server";
import { listRecipes, createRecipe } from "../../../lib/db";
import type { Recipe } from "../../../types/recipe";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const search = searchParams.get("search");
  const mealType = searchParams.get("meal_type");
  const dishType = searchParams.get("dish_type");

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  try {
    const recipes = await listRecipes(userId, { search, mealType, dishType });
    return NextResponse.json({ recipes });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as Recipe & { userId?: string };

  if (!body.userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const { userId, ...recipe } = body;

  try {
    const id = await createRecipe(userId, recipe);
    return NextResponse.json({ id });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to create recipe" },
      { status: 500 }
    );
  }
}
