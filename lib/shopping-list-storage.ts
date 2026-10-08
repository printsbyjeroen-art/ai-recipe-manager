import {
  guessStoreSection,
  normalizeIngredientName,
  normalizeStoreSection,
  normalizeText,
  normalizeUnit
} from "./ingredients";

export type ShoppingListRecipeRef = {
  id: string;
  title: string;
  plannedServings: number;
};

export type PersistedShoppingListItem = {
  key: string;
  name: string;
  amount: number;
  unit: string;
  store_section: string;
  checked?: boolean;
  isCustom?: boolean;
  recipeCount?: number;
  recipes?: ShoppingListRecipeRef[];
};

export function getShoppingListStorageKey(userId: string) {
  return `shopping-list:persistent:v3:${userId}`;
}

function getLegacyShoppingListStorageKeys(userId: string) {
  return [
    `shopping-list:persistent:v2:${userId}`,
    `shopping-list:persistent:${userId}`,
    `shopping-list:${userId}`
  ];
}

export function buildShoppingListItemKey(name: string, unit: string, storeSection?: string | null) {
  return `${normalizeIngredientName(name)}::${normalizeText(unit || "") || "unitless"}::${normalizeStoreSection(storeSection)}`;
}

export function buildShoppingListItemsFromRecipe(
  recipe: {
    id?: string;
    title: string;
    servings: number;
    ingredients?: Array<{
      name: string;
      amount: number;
      unit: string;
      store_section?: string | null;
    }>;
  },
  plannedServings = recipe.servings
) {
  const sourceServings = Math.max(1, Number(recipe.servings) || 1);
  const targetServings = Math.max(1, Number(plannedServings) || sourceServings);

  const items: PersistedShoppingListItem[] = (recipe.ingredients ?? [])
    .filter((ingredient) => ingredient?.name?.trim())
    .map((ingredient) => {
      const normalizedName = normalizeIngredientName(ingredient.name);
      const normalizedUnit = normalizeUnit(ingredient.unit || "");
      const storeSection = normalizeStoreSection(ingredient.store_section || guessStoreSection(ingredient.name));
      const amount = Number(
        (((Number(ingredient.amount) || 0) * normalizedUnit.multiplier * targetServings) / sourceServings).toFixed(2)
      );

      return {
        key: buildShoppingListItemKey(normalizedName, normalizedUnit.unit, storeSection),
        name: normalizedName,
        amount,
        unit: normalizedUnit.unit,
        store_section: storeSection,
        checked: false,
        isCustom: false,
        recipeCount: recipe.id ? 1 : 0,
        recipes: recipe.id
          ? [
              {
                id: recipe.id,
                title: recipe.title,
                plannedServings: targetServings
              }
            ]
          : []
      };
    });

  return mergeShoppingListItems([], items);
}

export function mergeShoppingListItems(
  existing: PersistedShoppingListItem[],
  additions: PersistedShoppingListItem[]
) {
  const map = new Map<string, PersistedShoppingListItem>();

  for (const item of existing) {
    const key = buildShoppingListItemKey(item.name, item.unit, item.store_section);
    map.set(key, {
      ...item,
      key,
      store_section: normalizeStoreSection(item.store_section)
    });
  }

  for (const item of additions) {
    const key = buildShoppingListItemKey(item.name, item.unit, item.store_section);
    const nextItem: PersistedShoppingListItem = {
      ...item,
      key,
      store_section: normalizeStoreSection(item.store_section)
    };
    const current = map.get(key);

    if (!current) {
      map.set(key, nextItem);
      continue;
    }

    const recipeMap = new Map<string, ShoppingListRecipeRef>();
    for (const recipe of current.recipes ?? []) {
      recipeMap.set(recipe.id, recipe);
    }
    for (const recipe of nextItem.recipes ?? []) {
      recipeMap.set(recipe.id, recipe);
    }

    map.set(key, {
      ...current,
      name: current.name || nextItem.name,
      unit: current.unit || nextItem.unit,
      amount: Number(((current.amount || 0) + (nextItem.amount || 0)).toFixed(2)),
      store_section: normalizeStoreSection(current.store_section || nextItem.store_section),
      checked: current.checked ?? false,
      isCustom: Boolean(current.isCustom || nextItem.isCustom),
      recipeCount: recipeMap.size || current.recipeCount || nextItem.recipeCount || 0,
      recipes: [...recipeMap.values()].sort((a, b) => a.title.localeCompare(b.title))
    });
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function readShoppingListFromStorage(userId: string): PersistedShoppingListItem[] {
  if (typeof window === "undefined") return [];

  const currentKey = getShoppingListStorageKey(userId);
  const keysToTry = [currentKey, ...getLegacyShoppingListStorageKeys(userId)];

  for (const key of keysToTry) {
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("The existing shopping list could not be read. Your browser data has not been changed.");
    }
    return parsed;
  }

  return [];
}
