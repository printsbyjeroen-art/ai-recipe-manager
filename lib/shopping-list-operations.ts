import {
  buildShoppingListItemKey,
  mergeShoppingListItems,
  type PersistedShoppingListItem
} from "./shopping-list-storage";

export type ShoppingListOperation =
  | { type: "initialize"; items: PersistedShoppingListItem[] }
  | { type: "add"; items: PersistedShoppingListItem[] }
  | { type: "check"; key: string; checked: boolean }
  | { type: "edit"; key: string; name: string; amount: number; unit: string; store_section: string }
  | { type: "remove"; key: string }
  | { type: "clear" }
  | { type: "uncheck" };

export type ShoppingListSnapshot = {
  items: PersistedShoppingListItem[];
  revision: number;
};

export function isShoppingListItem(value: unknown): value is PersistedShoppingListItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.key === "string" && item.key.length > 0 &&
    typeof item.name === "string" && item.name.trim().length > 0 &&
    typeof item.amount === "number" && Number.isFinite(item.amount) && item.amount >= 0 &&
    typeof item.unit === "string" &&
    typeof item.store_section === "string" &&
    (item.checked === undefined || typeof item.checked === "boolean") &&
    (item.isCustom === undefined || typeof item.isCustom === "boolean") &&
    (item.recipeCount === undefined || (typeof item.recipeCount === "number" && Number.isFinite(item.recipeCount))) &&
    (item.recipes === undefined || (Array.isArray(item.recipes) && item.recipes.every((recipe: unknown) => {
      if (!recipe || typeof recipe !== "object") return false;
      const ref = recipe as Record<string, unknown>;
      return typeof ref.id === "string" && typeof ref.title === "string" &&
        typeof ref.plannedServings === "number" && Number.isFinite(ref.plannedServings) && ref.plannedServings > 0;
    })))
  );
}

export function isShoppingListOperation(value: unknown): value is ShoppingListOperation {
  if (!value || typeof value !== "object") return false;
  const operation = value as Record<string, unknown>;
  switch (operation.type) {
    case "initialize":
    case "add":
      return Array.isArray(operation.items) && operation.items.every(isShoppingListItem);
    case "clear":
    case "uncheck":
      return true;
    case "remove":
      return typeof operation.key === "string" && operation.key.length > 0;
    case "check":
      return typeof operation.key === "string" && operation.key.length > 0 && typeof operation.checked === "boolean";
    case "edit":
      return typeof operation.key === "string" && operation.key.length > 0 &&
        typeof operation.name === "string" && operation.name.trim().length > 0 &&
        typeof operation.amount === "number" && Number.isFinite(operation.amount) && operation.amount > 0 &&
        typeof operation.unit === "string" && typeof operation.store_section === "string";
    default:
      return false;
  }
}

export class ShoppingListConflictError extends Error {}

export function applyShoppingListOperation(
  items: PersistedShoppingListItem[],
  operation: ShoppingListOperation
): PersistedShoppingListItem[] {
  switch (operation.type) {
    case "initialize":
      return items;
    case "add":
      return mergeShoppingListItems(items, operation.items);
    case "clear":
      return [];
    case "uncheck":
      return items.map((item) => ({ ...item, checked: false }));
    case "remove":
      return items.filter((item) => item.key !== operation.key);
    case "check":
    case "edit": {
      const current = items.find((item) => item.key === operation.key);
      if (!current) {
        throw new ShoppingListConflictError("This item was removed or renamed on another device. Refresh the list and try again.");
      }
      if (operation.type === "check") {
        return items.map((item) => item.key === operation.key ? { ...item, checked: operation.checked } : item);
      }
      const updated = {
        ...current,
        name: operation.name,
        amount: operation.amount,
        unit: operation.unit,
        store_section: operation.store_section,
        key: buildShoppingListItemKey(operation.name, operation.unit, operation.store_section)
      };
      return mergeShoppingListItems([], items.map((item) => item.key === operation.key ? updated : item));
    }
  }
}
