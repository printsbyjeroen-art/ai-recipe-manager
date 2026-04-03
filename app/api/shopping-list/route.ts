import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";
import { getWeekStartISO, WEEKMENU_SLOT } from "../../../lib/weekmenu";

type IngredientRow = {
  recipe_id: number;
  name: string;
  amount: number;
  unit: string;
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
  recipeCount: number;
  recipes: ShoppingListRecipeRef[];
};

type NormalizedUnit = {
  unit: string;
  multiplier: number;
};

const UNIT_ALIASES: Record<string, NormalizedUnit> = {
  g: { unit: "g", multiplier: 1 },
  gr: { unit: "g", multiplier: 1 },
  gram: { unit: "g", multiplier: 1 },
  grams: { unit: "g", multiplier: 1 },
  kg: { unit: "g", multiplier: 1000 },
  kilo: { unit: "g", multiplier: 1000 },
  kilogram: { unit: "g", multiplier: 1000 },
  kilograms: { unit: "g", multiplier: 1000 },
  ml: { unit: "ml", multiplier: 1 },
  milliliter: { unit: "ml", multiplier: 1 },
  milliliters: { unit: "ml", multiplier: 1 },
  l: { unit: "ml", multiplier: 1000 },
  liter: { unit: "ml", multiplier: 1000 },
  liters: { unit: "ml", multiplier: 1000 },
  el: { unit: "el", multiplier: 1 },
  eetlepel: { unit: "el", multiplier: 1 },
  eetlepels: { unit: "el", multiplier: 1 },
  tablespoon: { unit: "el", multiplier: 1 },
  tablespoons: { unit: "el", multiplier: 1 },
  tbsp: { unit: "el", multiplier: 1 },
  tl: { unit: "tl", multiplier: 1 },
  theelepel: { unit: "tl", multiplier: 1 },
  theelepels: { unit: "tl", multiplier: 1 },
  teaspoon: { unit: "tl", multiplier: 1 },
  teaspoons: { unit: "tl", multiplier: 1 },
  tsp: { unit: "tl", multiplier: 1 },
  stuk: { unit: "st", multiplier: 1 },
  stuks: { unit: "st", multiplier: 1 },
  piece: { unit: "st", multiplier: 1 },
  pieces: { unit: "st", multiplier: 1 },
  teen: { unit: "teen", multiplier: 1 },
  tenen: { unit: "teen", multiplier: 1 },
  clove: { unit: "teen", multiplier: 1 },
  cloves: { unit: "teen", multiplier: 1 },
  blik: { unit: "blik", multiplier: 1 },
  blikken: { unit: "blik", multiplier: 1 },
  can: { unit: "blik", multiplier: 1 },
  cans: { unit: "blik", multiplier: 1 },
  bos: { unit: "bos", multiplier: 1 },
  bossen: { unit: "bos", multiplier: 1 },
  bunch: { unit: "bos", multiplier: 1 },
  bunches: { unit: "bos", multiplier: 1 },
  snuf: { unit: "snuf", multiplier: 1 },
  snufje: { unit: "snuf", multiplier: 1 },
  pinch: { unit: "snuf", multiplier: 1 },
  pinches: { unit: "snuf", multiplier: 1 }
};

const INGREDIENT_TOKEN_ALIASES: Record<string, string> = {
  tomatoes: "tomato",
  tomaatjes: "tomaat",
  uien: "ui",
  eieren: "ei",
  paprikas: "paprika",
  wortels: "wortel",
  citroenen: "citroen",
  limoenen: "limoen",
  teentjes: "teen",
  cloves: "clove",
  onions: "onion"
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[,/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singularizeToken(token: string) {
  if (INGREDIENT_TOKEN_ALIASES[token]) {
    return INGREDIENT_TOKEN_ALIASES[token];
  }

  if (token.length > 4 && token.endsWith("en")) {
    return token.slice(0, -2);
  }

  if (token.length > 4 && token.endsWith("s") && !token.endsWith("is") && !token.endsWith("us")) {
    return token.slice(0, -1);
  }

  return token;
}

function normalizeIngredientName(name: string) {
  return normalizeText(name)
    .split(" ")
    .filter(Boolean)
    .map(singularizeToken)
    .join(" ");
}

function normalizeUnit(unit: string): NormalizedUnit {
  const normalized = normalizeText(unit);
  return UNIT_ALIASES[normalized] ?? { unit: normalized, multiplier: 1 };
}

function buildKey(name: string, unit: string) {
  return `${name}::${unit}`;
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

  const { data: ingredients, error: ingredientsError } = await supabaseAdmin
    .from("ingredients")
    .select("recipe_id, name, amount, unit")
    .in("recipe_id", recipeIds)
    .order("name", { ascending: true });

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
    const key = buildKey(normalizedName, normalizedUnit.unit);
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
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ week_start: weekStart, items });
}
