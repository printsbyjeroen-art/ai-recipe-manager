import { NextResponse } from "next/server";
import { supabaseBrowser } from "../../../../lib/supabase";
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
  const { data: existing } = await supabaseBrowser
    .from("week_menus")
    .select("*")
    .eq("week_start_date", weekStart)
    .eq("user_id", userId)
    .single();

  if (existing) return existing;

  const { data: created, error } = await supabaseBrowser
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
      recipe_id: null
    });
  }
  await supabaseBrowser.from("week_menu_items").insert(items);

  return created;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { week_start?: string };
  const weekStart = body.week_start || getWeekStartISO();

  const { data: userResult } = await supabaseBrowser.auth.getUser();
  const user = userResult?.user;
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const menu = await ensureWeekMenu(weekStart, user.id);

    let { data: dinnerRecipes } = await supabaseBrowser
      .from("recipes")
      .select("id")
      .eq("meal_type", "dinner")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (!dinnerRecipes || dinnerRecipes.length === 0) {
      const { data: allRecipes } = await supabaseBrowser
        .from("recipes")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      dinnerRecipes = allRecipes ?? [];
    }

    const ids = shuffle((dinnerRecipes ?? []).map((r: any) => r.id as number));

    const picked: number[] = [];
    for (let day = 0; day < 7; day++) {
      if (ids.length > 0) {
        picked.push(ids[day % ids.length]);
      } else {
        picked.push(0);
      }
    }

    const now = new Date().toISOString();
    for (let day = 0; day < 7; day++) {
      await supabaseBrowser
        .from("week_menu_items")
        .update({
          recipe_id: picked[day] || null,
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

