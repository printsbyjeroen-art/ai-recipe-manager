import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import {
  applyShoppingListOperation,
  isShoppingListItem,
  isShoppingListOperation,
  ShoppingListConflictError,
  type ShoppingListSnapshot
} from "../../../../lib/shopping-list-operations";
import { mergeShoppingListItems } from "../../../../lib/shopping-list-storage";

export const dynamic = "force-dynamic";

function readSnapshot(data: Record<string, unknown> | undefined): ShoppingListSnapshot {
  if (!data) return { items: [], revision: 0 };
  if (!Array.isArray(data.items) || !data.items.every(isShoppingListItem) ||
      typeof data.revision !== "number" || !Number.isSafeInteger(data.revision) || data.revision < 0) {
    throw new Error("Invalid saved shopping list data.");
  }
  return { items: data.items, revision: data.revision };
}

async function authenticatedUserId(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  try {
    const token = await getAdminAuth().verifyIdToken(authorization.slice(7));
    return token.uid;
  } catch (error) {
    console.error("Shopping list authentication failed", error);
    return null;
  }
}

export async function GET(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  try {
    const document = await getAdminDb().collection("shoppingLists").doc(userId).get();
    if (!document.exists) {
      return NextResponse.json({ items: [], revision: 0, exists: false }, { headers: { "Cache-Control": "no-store" } });
    }
    const snapshot = readSnapshot(document.data());
    return NextResponse.json(
      { ...snapshot, exists: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Failed to load shopping list", error);
    return NextResponse.json({ error: "Failed to load shopping list. Please try again." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid shopping list request." }, { status: 400 });
  }
  if (!isShoppingListOperation(payload)) {
    return NextResponse.json({ error: "Invalid shopping list operation." }, { status: 400 });
  }
  const operation = payload;

  try {
    const db = getAdminDb();
    const reference = db.collection("shoppingLists").doc(userId);
    const snapshot = await db.runTransaction(async (transaction): Promise<ShoppingListSnapshot> => {
      const document = await transaction.get(reference);
      const current = readSnapshot(document.data());
      if (operation.type === "initialize" && document.exists) return current;

      const next = {
        items: operation.type === "initialize"
          ? mergeShoppingListItems([], operation.items)
          : applyShoppingListOperation(current.items, operation),
        revision: current.revision + 1
      };
      // Keep the document even when empty: old browser lists must not restore deleted items.
      transaction.set(reference, { ...next, updated_at: new Date().toISOString() });
      return next;
    });
    return NextResponse.json(snapshot);
  } catch (error) {
    if (error instanceof ShoppingListConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Failed to save shopping list", error);
    return NextResponse.json({ error: "Failed to save shopping list. Please try again." }, { status: 500 });
  }
}
