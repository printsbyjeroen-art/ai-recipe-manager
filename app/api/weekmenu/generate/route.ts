import { NextResponse } from "next/server";
import { listDinnerRecipes, setWeekMenuItems } from "../../../../lib/db";
import { getWeekStartISO } from "../../../../lib/weekmenu";

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { week_start?: string; userId?: string };
  const weekStart = body.week_start || getWeekStartISO();

  if (!body.userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  try {
    const dinnerRecipes = await listDinnerRecipes(body.userId);
    const shuffledRecipes = shuffle(dinnerRecipes);

    const updates = Array.from({ length: 7 }, (_, day) => {
      const picked = shuffledRecipes.length > 0 ? shuffledRecipes[day % shuffledRecipes.length] : null;
      return {
        day_of_week: day,
        recipe_id: picked?.id ?? null,
        planned_servings: picked?.servings ?? null
      };
    });

    await setWeekMenuItems(body.userId, weekStart, updates);
    return NextResponse.json({ ok: true, week_start: weekStart });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to generate week menu" },
      { status: 500 }
    );
  }
}
