import { NextResponse } from "next/server";
import {
  ensureWeekMenu,
  listDinnerRecipes,
  updateWeekMenuItem
} from "../../../../lib/db";
import { getWeekStartISO, WEEKMENU_SLOT } from "../../../../lib/weekmenu";

function pickRandom<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
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
    const menu = await ensureWeekMenu(body.userId, weekStart);
    const items = (menu.items ?? []) as Array<{
      day_of_week: number;
      meal_slot: string;
      recipe_id: string | null;
    }>;

    const used = new Set<string>(
      items
        .filter((i) => i.meal_slot === WEEKMENU_SLOT && i.recipe_id)
        .map((i) => i.recipe_id as string)
    );

    const current =
      items.find((i) => i.day_of_week === body.day_of_week && i.meal_slot === WEEKMENU_SLOT)
        ?.recipe_id ?? null;

    const candidates = await listDinnerRecipes(body.userId);
    const filtered = candidates.filter(
      (candidate) => candidate.id !== current && !used.has(candidate.id)
    );

    const next = filtered.length > 0 ? pickRandom(filtered) : null;

    const item = await updateWeekMenuItem(body.userId, weekStart, body.day_of_week, {
      recipe_id: next?.id ?? null,
      planned_servings: next?.servings ?? null
    });

    return NextResponse.json({ item });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to replace dinner" },
      { status: 500 }
    );
  }
}
