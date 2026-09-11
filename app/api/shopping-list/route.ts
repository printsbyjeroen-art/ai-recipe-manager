import { NextResponse } from "next/server";
import {
  guessStoreSection,
  normalizeIngredientName,
  normalizeStoreSection,
  normalizeUnit
} from "../../../lib/ingredients";
import { getRecipeById, getWeekMenuItems } from "../../../lib/db";
import { getWeekStartISO, WEEKMENU_SLOT } from "../../../lib/weekmenu";

type ShoppingListRecipeRef = {
  id: string;
  title: string;
  plannedServings: number;
};

type ShoppingListItem = {
  key: string;
  name: string;
  amount: number;
  unit: string;
  store_section: string;
  recipeCount: number;
  recipes: ShoppingListRecipeRef[];
};

function buildKey(name: string, unit: string, storeSection: string) {
  return `${name}::${unit}::${normalizeStoreSection(storeSection)}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const weekStart = searchParams.get("week_start") || getWeekStartISO();
  const dayParam = searchParams.get("day_of_week");
  const dayOfWeek = dayParam === null ? null : Number(dayParam);

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }
  if (dayOfWeek !== null && (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6)) {
    return NextResponse.json({ error: "Invalid day_of_week" }, { status: 400 });
  }

  try {
    const menu = await getWeekMenuItems(userId, weekStart);
    const menuItems = (menu.items ?? []).filter(
      (item) =>
        item.meal_slot === WEEKMENU_SLOT &&
        item.recipe_id &&
        (dayOfWeek === null || item.day_of_week === dayOfWeek)
    );

    const recipeIds = [...new Set(menuItems.map((item) => item.recipe_id).filter(Boolean))] as string[];

    if (recipeIds.length === 0) {
      return NextResponse.json({ week_start: weekStart, items: [] });
    }

    const recipes = (await Promise.all(recipeIds.map((id) => getRecipeById(id)))).filter(Boolean);

    const recipeMap = new Map(recipes.map((recipe) => [recipe!.id as string, recipe!]));

    const plannedServingsMap = new Map<string, number>();
    for (const item of menuItems) {
      if (!item.recipe_id) continue;
      const recipe = recipeMap.get(item.recipe_id);
      plannedServingsMap.set(
        item.recipe_id,
        Math.max(1, Number(item.planned_servings) || recipe?.servings || 1)
      );
    }

    const grouped = new Map<string, ShoppingListItem & { recipeIds: Set<string> }>();

    for (const recipe of recipes) {
      if (!recipe?.id) continue;
      const sourceServings = Math.max(1, Number(recipe.servings) || 1);
      const targetServings = Math.max(1, plannedServingsMap.get(recipe.id) || sourceServings);
      const portionScale = targetServings / sourceServings;

      for (const ingredient of recipe.ingredients ?? []) {
        const normalizedName = normalizeIngredientName(ingredient.name);
        const normalizedUnit = normalizeUnit(ingredient.unit);
        const storeSection = normalizeStoreSection(
          ingredient.store_section || guessStoreSection(ingredient.name)
        );
        const key = buildKey(normalizedName, normalizedUnit.unit, storeSection);
        const normalizedAmount =
          (Number(ingredient.amount) || 0) * normalizedUnit.multiplier * portionScale;
        const existing = grouped.get(key);

        if (existing) {
          existing.amount += normalizedAmount;
          existing.recipeIds.add(recipe.id);
          if (!existing.recipes.some((item) => item.id === recipe.id)) {
            existing.recipes.push({
              id: recipe.id,
              title: recipe.title,
              plannedServings: targetServings
            });
          }
        } else {
          grouped.set(key, {
            key,
            name: normalizedName,
            amount: normalizedAmount,
            unit: normalizedUnit.unit,
            store_section: storeSection,
            recipeCount: 1,
            recipes: [
              {
                id: recipe.id,
                title: recipe.title,
                plannedServings: targetServings
              }
            ],
            recipeIds: new Set([recipe.id])
          });
        }
      }
    }

    const items = [...grouped.values()]
      .map(({ recipeIds, ...item }) => ({
        ...item,
        amount: Number(item.amount.toFixed(2)),
        recipeCount: recipeIds.size,
        recipes: item.recipes.sort((a, b) => a.title.localeCompare(b.title))
      }))
      .sort((a, b) => {
        const sectionDiff = a.store_section.localeCompare(b.store_section);
        if (sectionDiff !== 0) return sectionDiff;
        return a.name.localeCompare(b.name);
      });

    return NextResponse.json({ week_start: weekStart, items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
