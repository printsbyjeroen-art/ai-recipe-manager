import { NextResponse } from "next/server";
import {
  guessStoreSection,
  normalizeIngredientName,
  normalizeStoreSection,
  normalizeUnit
} from "../../../lib/ingredients";
import { supabaseAdmin } from "../../../lib/supabase";
import { getWeekStartISO, WEEKMENU_SLOT } from "../../../lib/weekmenu";

type IngredientRow = {
  recipe_id: number;
  name: string;
  amount: number;
  unit: string;
  store_section?: string | null;
};

type MenuItemRow = {
  recipe_id: number;
  planned_servings: number | null;
};

type RecipeRow = {
  id: number;
  title: string;
  servings: number;
};

type ShoppingListRecipeRef = {
  id: number;
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

function isMissingStoreSectionColumnError(error: any) {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("store_section") && message.includes("does not exist");
}

function buildKey(name: string, unit: string, storeSection: string) {
  return `${name}::${unit}::${normalizeStoreSection(storeSection)}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const weekStart = searchParams.get("week_start") || getWeekStartISO();

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const { data: menu, error: menuError } = await supabaseAdmin
    .from("week_menus")
    .select("id")
    .eq("user_id", userId)
    .eq("week_start_date", weekStart)
    .single();

  if (menuError) {
    return NextResponse.json({ week_start: weekStart, items: [] });
  }

  const { data: menuItems, error: menuItemsError } = await supabaseAdmin
    .from("week_menu_items")
    .select("recipe_id, planned_servings")
    .eq("week_menu_id", menu.id)
    .eq("meal_slot", WEEKMENU_SLOT)
    .not("recipe_id", "is", null);

  if (menuItemsError) {
    return NextResponse.json({ error: menuItemsError.message }, { status: 500 });
  }

  const recipeIds = [...new Set((menuItems ?? []).map((item: any) => item.recipe_id).filter(Boolean))] as number[];

  if (recipeIds.length === 0) {
    return NextResponse.json({ week_start: weekStart, items: [] });
  }

  const { data: recipes, error: recipesError } = await supabaseAdmin
    .from("recipes")
    .select("id, title, servings")
    .in("id", recipeIds);

  if (recipesError) {
    return NextResponse.json({ error: recipesError.message }, { status: 500 });
  }

  const primaryIngredients = await supabaseAdmin
    .from("ingredients")
    .select("recipe_id, name, amount, unit, store_section")
    .in("recipe_id", recipeIds)
    .order("name", { ascending: true });

  let ingredients = primaryIngredients.data as IngredientRow[] | null;
  let ingredientsError = primaryIngredients.error;

  if (ingredientsError && isMissingStoreSectionColumnError(ingredientsError)) {
    const fallback = await supabaseAdmin
      .from("ingredients")
      .select("recipe_id, name, amount, unit")
      .in("recipe_id", recipeIds)
      .order("name", { ascending: true });
    ingredients = fallback.data as IngredientRow[] | null;
    ingredientsError = fallback.error;
  }

  if (ingredientsError) {
    return NextResponse.json({ error: ingredientsError.message }, { status: 500 });
  }

  const recipeMap = new Map<number, RecipeRow>();
  for (const recipe of (recipes ?? []) as RecipeRow[]) {
    recipeMap.set(recipe.id, recipe);
  }

  const plannedServingsMap = new Map<number, number>();
  for (const item of (menuItems ?? []) as MenuItemRow[]) {
    if (!item.recipe_id) continue;
    const recipe = recipeMap.get(item.recipe_id);
    plannedServingsMap.set(item.recipe_id, Math.max(1, Number(item.planned_servings) || recipe?.servings || 1));
  }

  const grouped = new Map<string, ShoppingListItem & { recipeIds: Set<number> }>();

  for (const ingredient of (ingredients ?? []) as IngredientRow[]) {
    const recipe = recipeMap.get(ingredient.recipe_id);
    const sourceServings = Math.max(1, Number(recipe?.servings) || 1);
    const targetServings = Math.max(1, plannedServingsMap.get(ingredient.recipe_id) || sourceServings);
    const portionScale = targetServings / sourceServings;
    const normalizedName = normalizeIngredientName(ingredient.name);
    const normalizedUnit = normalizeUnit(ingredient.unit);
    const storeSection = normalizeStoreSection(ingredient.store_section || guessStoreSection(ingredient.name));
    const key = buildKey(normalizedName, normalizedUnit.unit, storeSection);
    const normalizedAmount = (Number(ingredient.amount) || 0) * normalizedUnit.multiplier * portionScale;
    const existing = grouped.get(key);

    if (existing) {
      existing.amount += normalizedAmount;
      existing.recipeIds.add(ingredient.recipe_id);
      if (recipe && !existing.recipes.some((item) => item.id === recipe.id)) {
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
        recipes: recipe
          ? [
              {
                id: recipe.id,
                title: recipe.title,
                plannedServings: targetServings
              }
            ]
          : [],
        recipeIds: new Set([ingredient.recipe_id])
      });
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
}
