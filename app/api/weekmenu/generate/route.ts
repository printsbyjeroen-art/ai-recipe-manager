import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase";
import { getWeekStartISO, WEEKMENU_SLOT } from "../../../../lib/weekmenu";

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
  const body = (await request.json().catch(() => ({}))) as { week_start?: string; userId?: string };
  const weekStart = body.week_start || getWeekStartISO();

  if (!body.userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  try {
    const menu = await ensureWeekMenu(weekStart, body.userId);

    let { data: dinnerRecipes } = await supabaseAdmin
      .from("recipes")
      .select("id, servings")
      .eq("meal_type", "dinner")
      .eq("user_id", body.userId)
      .order("created_at", { ascending: false });

    if (!dinnerRecipes || dinnerRecipes.length === 0) {
      const { data: allRecipes } = await supabaseAdmin
        .from("recipes")
        .select("id, servings")
        .eq("user_id", body.userId)
        .order("created_at", { ascending: false });
      dinnerRecipes = allRecipes ?? [];
    }

    const shuffledRecipes = shuffle(
      (dinnerRecipes ?? []).map((r: any) => ({ id: r.id as number, servings: Number(r.servings) || 1 }))
    );

    const picked: Array<{ id: number; servings: number } | null> = [];
    for (let day = 0; day < 7; day++) {
      if (shuffledRecipes.length > 0) {
        picked.push(shuffledRecipes[day % shuffledRecipes.length]);
      } else {
        picked.push(null);
      }
    }

    const now = new Date().toISOString();
    for (let day = 0; day < 7; day++) {
      await supabaseAdmin
        .from("week_menu_items")
        .update({
          recipe_id: picked[day]?.id ?? null,
          planned_servings: picked[day]?.servings ?? null,
          updated_at: now
        })
        .eq("week_menu_id", menu.id)
        .eq("day_of_week", day)
        .eq("meal_slot", WEEKMENU_SLOT);
    }

    return NextResponse.json({ ok: true, week_start: weekStart });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to generate week menu" },
      { status: 500 }
    );
  }
}

