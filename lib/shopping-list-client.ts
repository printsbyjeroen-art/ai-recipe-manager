import { getCurrentUser } from "./auth-client";
import { readShoppingListFromStorage, type PersistedShoppingListItem } from "./shopping-list-storage";
import { isShoppingListItem, type ShoppingListOperation, type ShoppingListSnapshot } from "./shopping-list-operations";

async function requestShoppingList(userId: string, operation?: ShoppingListOperation) {
  const user = await getCurrentUser();
  if (!user || user.uid !== userId) throw new Error("Please sign in first.");
  const token = await user.getIdToken();
  const response = await fetch("/api/shopping-list/saved", {
    method: operation ? "POST" : "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(operation ? { "Content-Type": "application/json" } : {})
    },
    ...(operation ? { body: JSON.stringify(operation) } : {})
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to synchronize shopping list.");
  if (!Array.isArray(data.items) || !data.items.every(isShoppingListItem) ||
      !Number.isSafeInteger(data.revision) || data.revision < 0) {
    throw new Error("Invalid shopping list response.");
  }
  return data as ShoppingListSnapshot & { exists?: boolean };
}

export async function loadShoppingList(userId: string): Promise<ShoppingListSnapshot> {
  const snapshot = await requestShoppingList(userId);
  if (snapshot.exists === false) {
    return requestShoppingList(userId, { type: "initialize", items: readShoppingListFromStorage(userId) });
  }
  return snapshot;
}

export async function changeShoppingList(userId: string, operation: ShoppingListOperation) {
  await loadShoppingList(userId);
  return requestShoppingList(userId, operation);
}

export async function mergeIntoShoppingList(userId: string, additions: PersistedShoppingListItem[]) {
  const snapshot = await changeShoppingList(userId, { type: "add", items: additions });
  return snapshot.items;
}
