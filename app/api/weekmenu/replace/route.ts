import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase";
import { getWeekStartISO, WEEKMENU_SLOT } from "../../../../lib/weekmenu";

function pickRandom<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

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

export async function POST(request: Request) {
  const body = (await request.json()) as { week_start?: string; userId?: string; day_of_week: number };
  const weekStart = body.week_start || getWeekStartISO();

  if (body.day_of_week < 0 || body.day_of_week > 6) {
    return NextResponse.json({ error: "Invalid day_of_week" }, { status: 400 });
  }

  if (!body.userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  try {
    const menu = await ensureWeekMenu(weekStart, body.userId);

    const { data: items } = await supabaseAdmin
      .from("week_menu_items")
      .select("day_of_week, recipe_id")
      .eq("week_menu_id", menu.id)
      .eq("meal_slot", WEEKMENU_SLOT);

    const used = new Set<number>(
      (items ?? [])
        .filter((i: any) => i.recipe_id !== null)
        .map((i: any) => i.recipe_id as number)
    );

    const current =
      (items ?? []).find((i: any) => i.day_of_week === body.day_of_week)?.recipe_id ??
      null;

    let { data: candidates } = await supabaseAdmin
      .from("recipes")
      .select("id, servings")
      .eq("meal_type", "dinner")
      .eq("user_id", body.userId)
      .order("created_at", { ascending: false });

    if (!candidates || candidates.length === 0) {
      const { data: all } = await supabaseAdmin
        .from("recipes")
        .select("id, servings")
        .eq("user_id", body.userId)
        .order("created_at", { ascending: false });
      candidates = all ?? [];
    }

    const filtered = (candidates ?? [])
      .map((c: any) => ({ id: c.id as number, servings: Number(c.servings) || 1 }))
      .filter((candidate) => candidate.id !== current && !used.has(candidate.id));

    const next = filtered.length > 0 ? pickRandom(filtered) : null;
    const now = new Date().toISOString();

    const { data: updated, error } = await supabaseAdmin
      .from("week_menu_items")
      .update({ recipe_id: next?.id ?? null, planned_servings: next?.servings ?? null, updated_at: now })
      .eq("week_menu_id", menu.id)
      .eq("day_of_week", body.day_of_week)
      .eq("meal_slot", WEEKMENU_SLOT)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ item: updated });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to replace dinner" },
      { status: 500 }
    );
  }
}

