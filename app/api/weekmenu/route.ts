import { NextResponse } from "next/server";
import { getWeekMenuItems, updateWeekMenuItem } from "../../../lib/db";
import { getWeekStartISO } from "../../../lib/weekmenu";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const weekStart = searchParams.get("week_start") || getWeekStartISO();
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  try {
    const data = await getWeekMenuItems(userId, weekStart);
    return NextResponse.json(data);
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
    recipe_id: string | null;
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
    const item = await updateWeekMenuItem(body.userId, weekStart, body.day_of_week, {
      recipe_id: body.recipe_id,
      planned_servings: body.recipe_id
        ? Math.max(1, Number(body.planned_servings) || 1)
        : null
    });

    return NextResponse.json({ item });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to update item" },
      { status: 500 }
    );
  }
}
