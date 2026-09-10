import { NextResponse } from "next/server";
import {
  getUserRecipeIngredientRows,
  renameIngredientForUser,
  updateIngredientProfileForUser
} from "../../../lib/db";
import { guessStoreSection, normalizeIngredientName, normalizeStoreSection } from "../../../lib/ingredients";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  try {
    const rows = await getUserRecipeIngredientRows(userId);

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
    const normalized = normalizeIngredientName(body.name);
    const updatePayload = {
      store_section: normalizeStoreSection(body.store_section),
      calories_per_100g: Math.max(0, Number(body.calories_per_100g) || 0),
      protein_g_per_100g: Math.max(0, Number(body.protein_g_per_100g) || 0),
      carbs_g_per_100g: Math.max(0, Number(body.carbs_g_per_100g) || 0),
      fat_g_per_100g: Math.max(0, Number(body.fat_g_per_100g) || 0),
      unit: body.default_unit ?? ""
    };

    const storedInDb = await updateIngredientProfileForUser(
      body.userId,
      normalized,
      updatePayload,
      (name) => normalizeIngredientName(name) === normalized
    );

    return NextResponse.json({ ok: true, storedInDb });
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
    const normalized = normalizeIngredientName(name);
    await updateIngredientProfileForUser(
      userId,
      normalized,
      {
        store_section: "miscellaneous",
        calories_per_100g: 0,
        protein_g_per_100g: 0,
        carbs_g_per_100g: 0,
        fat_g_per_100g: 0,
        unit: ""
      },
      (rowName) => normalizeIngredientName(rowName) === normalized
    );

    return NextResponse.json({ ok: true, storedInDb: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to reset ingredient profile" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    userId?: string;
    fromName?: string;
    toName?: string;
  };

  if (!body.userId || !body.fromName?.trim() || !body.toName?.trim()) {
    return NextResponse.json({ error: "Missing userId, fromName or toName" }, { status: 400 });
  }

  const fromName = normalizeIngredientName(body.fromName);
  const toName = normalizeIngredientName(body.toName);
  if (!fromName || !toName || fromName === toName) {
    return NextResponse.json({ error: "Choose a different ingredient name" }, { status: 400 });
  }

  try {
    const result = await renameIngredientForUser(body.userId, fromName, toName);
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to rename ingredient" }, { status: 500 });
  }
}
