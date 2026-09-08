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
    map.set(item.key || buildShoppingListItemKey(item.name, item.unit, item.store_section), {
      ...item,
      key: item.key || buildShoppingListItemKey(item.name, item.unit, item.store_section),
      store_section: normalizeStoreSection(item.store_section)
    });
  }

  for (const item of additions) {
    const key = item.key || buildShoppingListItemKey(item.name, item.unit, item.store_section);
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
      isCustom: current.isCustom || nextItem.isCustom,
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
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;

      if (key !== currentKey) {
        window.localStorage.setItem(currentKey, JSON.stringify(parsed));
      }

      return parsed;
    } catch {
      // Try the next legacy key if one exists.
    }
  }

  return [];
}

export function writeShoppingListToStorage(userId: string, items: PersistedShoppingListItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getShoppingListStorageKey(userId), JSON.stringify(items));
}

export function mergeIntoShoppingList(userId: string, additions: PersistedShoppingListItem[]) {
  const merged = mergeShoppingListItems(readShoppingListFromStorage(userId), additions);
  writeShoppingListToStorage(userId, merged);
  return merged;
}
