import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";
import { guessStoreSection, normalizeIngredientName, normalizeStoreSection } from "../../../lib/ingredients";

type IngredientRow = {
  id: number;
  recipe_id: number;
  name: string;
  unit: string;
  store_section?: string | null;
  calories_per_100g?: number | null;
  protein_g_per_100g?: number | null;
  carbs_g_per_100g?: number | null;
  fat_g_per_100g?: number | null;
};

function isMissingColumnError(error: any, column: string) {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes(column.toLowerCase()) && message.includes("does not exist");
}

async function getUserRecipeIds(userId: string) {
  const { data, error } = await supabaseAdmin.from("recipes").select("id").eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((item: any) => Number(item.id)).filter(Boolean) as number[];
}

async function getIngredientRows(recipeIds: number[]) {
  if (recipeIds.length === 0) return [] as IngredientRow[];

  const primary = await supabaseAdmin
    .from("ingredients")
    .select(
      "id, recipe_id, name, unit, store_section, calories_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g"
    )
    .in("recipe_id", recipeIds)
    .order("name", { ascending: true });

  let data = primary.data as IngredientRow[] | null;
  let error = primary.error;

  if (error && isMissingColumnError(error, "store_section")) {
    const fallback = await supabaseAdmin
      .from("ingredients")
      .select("id, recipe_id, name, unit")
      .in("recipe_id", recipeIds)
      .order("name", { ascending: true });
    data = fallback.data as IngredientRow[] | null;
    error = fallback.error;
  }

  if (error) throw error;
  return (data ?? []) as IngredientRow[];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  try {
    const recipeIds = await getUserRecipeIds(userId);
    const rows = await getIngredientRows(recipeIds);

    const grouped = new Map<
      string,
      {
        name: string;
        normalized_name: string;
        default_unit: string;
        store_section: string;
        calories_per_100g: number;
        protein_g_per_100g: number;
        carbs_g_per_100g: number;
        fat_g_per_100g: number;
        usageCount: number;
      }
    >();

    for (const row of rows) {
      const normalized = normalizeIngredientName(row.name);
      if (!normalized) continue;

      const existing = grouped.get(normalized);
      const nextStoreSection = normalizeStoreSection(row.store_section || guessStoreSection(row.name));
      const nextCalories = Number(row.calories_per_100g) || 0;
      const nextProtein = Number(row.protein_g_per_100g) || 0;
      const nextCarbs = Number(row.carbs_g_per_100g) || 0;
      const nextFat = Number(row.fat_g_per_100g) || 0;

      if (!existing) {
        grouped.set(normalized, {
          name: row.name,
          normalized_name: normalized,
          default_unit: row.unit || "",
          store_section: nextStoreSection,
          calories_per_100g: nextCalories,
          protein_g_per_100g: nextProtein,
          carbs_g_per_100g: nextCarbs,
          fat_g_per_100g: nextFat,
          usageCount: 1
        });
        continue;
      }

      existing.usageCount += 1;
      if (!existing.default_unit && row.unit) {
        existing.default_unit = row.unit;
      }
      if (row.store_section) {
        existing.store_section = nextStoreSection;
      }
      if (nextCalories) existing.calories_per_100g = nextCalories;
      if (nextProtein) existing.protein_g_per_100g = nextProtein;
      if (nextCarbs) existing.carbs_g_per_100g = nextCarbs;
      if (nextFat) existing.fat_g_per_100g = nextFat;
    }

    return NextResponse.json({
      ingredients: [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name))
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to load ingredients" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const body = (await request.json()) as {
    userId?: string;
    name?: string;
    store_section?: string;
    default_unit?: string;
    calories_per_100g?: number;
    protein_g_per_100g?: number;
    carbs_g_per_100g?: number;
    fat_g_per_100g?: number;
  };

  if (!body.userId || !body.name?.trim()) {
    return NextResponse.json({ error: "Missing userId or name" }, { status: 400 });
  }

  try {
    const recipeIds = await getUserRecipeIds(body.userId);
    const rows = await getIngredientRows(recipeIds);
    const normalized = normalizeIngredientName(body.name);
    const targetIds = rows
      .filter((row) => normalizeIngredientName(row.name) === normalized)
      .map((row) => row.id);

    if (targetIds.length === 0) {
      return NextResponse.json({ ok: true, storedInDb: false });
    }

    const updatePayload = {
      store_section: normalizeStoreSection(body.store_section),
      calories_per_100g: Math.max(0, Number(body.calories_per_100g) || 0),
      protein_g_per_100g: Math.max(0, Number(body.protein_g_per_100g) || 0),
      carbs_g_per_100g: Math.max(0, Number(body.carbs_g_per_100g) || 0),
      fat_g_per_100g: Math.max(0, Number(body.fat_g_per_100g) || 0),
      unit: body.default_unit ?? ""
    };

    const { error } = await supabaseAdmin.from("ingredients").update(updatePayload).in("id", targetIds);

    if (error && isMissingColumnError(error, "store_section")) {
      return NextResponse.json({
        ok: true,
        storedInDb: false,
        warning: "Run the latest Supabase schema SQL to sync ingredient profile fields to the database."
      });
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, storedInDb: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to save ingredient profile" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const name = searchParams.get("name");

  if (!userId || !name?.trim()) {
    return NextResponse.json({ error: "Missing userId or name" }, { status: 400 });
  }

  try {
    const recipeIds = await getUserRecipeIds(userId);
    const rows = await getIngredientRows(recipeIds);
    const normalized = normalizeIngredientName(name);
    const targetIds = rows
      .filter((row) => normalizeIngredientName(row.name) === normalized)
      .map((row) => row.id);

    if (targetIds.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const { error } = await supabaseAdmin
      .from("ingredients")
      .update({
        store_section: "miscellaneous",
        calories_per_100g: 0,
        protein_g_per_100g: 0,
        carbs_g_per_100g: 0,
        fat_g_per_100g: 0
      })
      .in("id", targetIds);

    if (error && isMissingColumnError(error, "store_section")) {
      return NextResponse.json({ ok: true, storedInDb: false });
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, storedInDb: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to reset ingredient profile" }, { status: 500 });
  }
}
