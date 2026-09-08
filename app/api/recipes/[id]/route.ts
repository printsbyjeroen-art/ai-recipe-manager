import { NextResponse } from "next/server";
import { deleteRecipe, getRecipeById, updateRecipe } from "../../../../lib/db";
import type { Recipe } from "../../../../types/recipe";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const recipe = await getRecipeById(params.id);
  if (!recipe) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ recipe });
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = (await request.json()) as Recipe;

  try {
    await updateRecipe(params.id, body);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await deleteRecipe(params.id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
