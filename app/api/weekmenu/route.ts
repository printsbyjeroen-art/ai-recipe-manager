import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";
import { getWeekStartISO, WEEKMENU_SLOT } from "../../../lib/weekmenu";

async function ensureWeekMenu(weekStart: string, userId: string) {
  const { data: existing } = await supabaseAdmin
    .from("week_menus")
    .select("*")
    .eq("week_start_date", weekStart)
    .eq("user_id", userId)
    .single();

  if (existing) return existing;

  const { data: created, error } = await supabaseAdmin
    .from("week_menus")
    .insert({ week_start_date: weekStart, user_id: userId })
    .select("*")
    .single();

  if (error || !created) {
    throw new Error(error?.message || "Failed to create week menu");
  }

  const items: any[] = [];
  for (let day = 0; day < 7; day++) {
    items.push({
      week_menu_id: created.id,
      day_of_week: day,
      meal_slot: WEEKMENU_SLOT,
      recipe_id: null,
      planned_servings: null
    });
  }
  await supabaseAdmin.from("week_menu_items").insert(items);

  return created;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const weekStart = searchParams.get("week_start") || getWeekStartISO();
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  try {
    const menu = await ensureWeekMenu(weekStart, userId);

    const { data: items, error } = await supabaseAdmin
      .from("week_menu_items")
      .select("id, day_of_week, meal_slot, recipe_id, planned_servings, updated_at")
      .eq("week_menu_id", menu.id)
      .eq("meal_slot", WEEKMENU_SLOT)
      .order("day_of_week", { ascending: true })
      .order("meal_slot", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      week_start: weekStart,
      menu_id: menu.id,
      items: items ?? []
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to load week menu" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const body = (await request.json()) as {
    week_start?: string;
    userId?: string;
    day_of_week: number;
    recipe_id: number | null;
    planned_servings?: number | null;
  };

  const weekStart = body.week_start || getWeekStartISO();

  if (body.day_of_week < 0 || body.day_of_week > 6) {
    return NextResponse.json({ error: "Invalid day_of_week" }, { status: 400 });
  }

  if (!body.userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  try {
    const menu = await ensureWeekMenu(weekStart, body.userId);
    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("week_menu_items")
      .update({
        recipe_id: body.recipe_id,
        planned_servings: body.recipe_id ? Math.max(1, Number(body.planned_servings) || 1) : null,
        updated_at: now
      })
      .eq("week_menu_id", menu.id)
      .eq("day_of_week", body.day_of_week)
      .eq("meal_slot", WEEKMENU_SLOT)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ item: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to update item" },
      { status: 500 }
    );
  }
}

