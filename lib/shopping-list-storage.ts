import { normalizeIngredientName, normalizeStoreSection, normalizeText } from "./ingredients";

export type ShoppingListRecipeRef = {
  id: number;
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

export function buildShoppingListItemKey(name: string, unit: string, storeSection?: string | null) {
  return `${normalizeIngredientName(name)}::${normalizeText(unit || "") || "unitless"}::${normalizeStoreSection(storeSection)}`;
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

    const recipeMap = new Map<number, ShoppingListRecipeRef>();
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

  try {
    const raw = window.localStorage.getItem(getShoppingListStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
