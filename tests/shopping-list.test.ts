import assert from "node:assert/strict";
import { test, mock } from "node:test";
import firebaseAdmin = require("../lib/firebase-admin");
import { GET, POST } from "../app/api/shopping-list/saved/route";
import {
  applyShoppingListOperation,
  isShoppingListOperation,
  ShoppingListConflictError,
  type ShoppingListOperation,
  type ShoppingListSnapshot
} from "../lib/shopping-list-operations";
import { buildShoppingListItemKey, mergeShoppingListItems, type PersistedShoppingListItem } from "../lib/shopping-list-storage";

function item(name: string, amount = 1): PersistedShoppingListItem {
  return {
    key: buildShoppingListItemKey(name, "", "miscellaneous"),
    name, amount, unit: "", store_section: "miscellaneous", checked: false
  };
}

test("changes apply to the latest list without resurrecting removed items", () => {
  const apple = item("appel");
  const milk = item("melk");
  let items = applyShoppingListOperation([apple], { type: "add", items: [milk] });
  items = applyShoppingListOperation(items, { type: "remove", key: apple.key });
  items = applyShoppingListOperation(items, { type: "check", key: milk.key, checked: true });
  assert.deepEqual(items, [{ ...milk, checked: true }]);
  assert.throws(
    () => applyShoppingListOperation(items, { type: "edit", key: apple.key, name: "appel", amount: 2, unit: "", store_section: "produce" }),
    ShoppingListConflictError
  );
});

test("editing preserves checks and unrelated additions; only explicit operations clear items", () => {
  const milk = item("melk");
  const bread = item("brood");
  const checked = applyShoppingListOperation([milk, bread], { type: "check", key: milk.key, checked: true });
  const edited = applyShoppingListOperation(checked, {
    type: "edit", key: milk.key, name: "melk", amount: 3, unit: "", store_section: "miscellaneous"
  });
  assert.equal(edited.find((entry) => entry.key === milk.key)?.checked, true);
  assert.equal(edited.find((entry) => entry.key === milk.key)?.amount, 3);
  assert.ok(edited.some((entry) => entry.key === bread.key));
  assert.equal(applyShoppingListOperation(edited, { type: "uncheck" }).length, 2);
  assert.deepEqual(applyShoppingListOperation(edited, { type: "clear" }), []);
  assert.deepEqual(applyShoppingListOperation([], { type: "initialize", items: [milk] }), []);
});

test("canonical keys merge legacy unitless items with newly exported ingredients", () => {
  const milk = item("melk");
  const merged = mergeShoppingListItems([{ ...milk, key: "melk::::miscellaneous" }], [milk]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].amount, 2);
  assert.equal(merged[0].key, milk.key);
});

test("operation validation rejects malformed or non-finite amounts and invalid checks", () => {
  assert.ok(isShoppingListOperation({ type: "add", items: [item("melk")] }));
  for (const invalid of [
    null, { type: "replace", items: [] }, { type: "check", key: "x", checked: "yes" },
    { type: "add", items: [{ ...item("melk"), amount: Infinity }] },
    { type: "add", items: [{ ...item("melk"), recipes: [{ id: "x" }] }] }
  ]) {
    assert.equal(isShoppingListOperation(invalid), false);
  }
});

test("saved API retains empty records, serializes devices' changes and isolates accounts", async () => {
  const documents = new Map<string, ShoppingListSnapshot>();
  let queue: Promise<unknown> = Promise.resolve();
  const fakeDb = {
    collection: () => ({
      doc: (id: string) => ({
        id,
        get: async () => ({ exists: documents.has(id), data: () => documents.get(id) })
      })
    }),
    runTransaction: (callback: (transaction: {
      get: (reference: { id: string }) => Promise<{ exists: boolean; data: () => ShoppingListSnapshot | undefined }>;
      set: (reference: { id: string }, data: ShoppingListSnapshot) => void;
    }) => Promise<ShoppingListSnapshot>) => {
      const result = queue.then(() => callback({
        get: async (reference) => ({ exists: documents.has(reference.id), data: () => documents.get(reference.id) }),
        set: (reference, data) => { documents.set(reference.id, structuredClone(data)); }
      }));
      queue = result.catch(() => undefined);
      return result;
    }
  };
  const dbMock = mock.method(firebaseAdmin, "getAdminDb", () => fakeDb);
  const authMock = mock.method(firebaseAdmin, "getAdminAuth", () => ({
    verifyIdToken: async (token: string) => ({ uid: token === "account-b" ? "b" : "a" })
  }));
  const request = (operation?: ShoppingListOperation, token = "account-a") => new Request("http://localhost/api/shopping-list/saved", {
    method: operation ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(operation ? { body: JSON.stringify(operation) } : {})
  });
  try {
    assert.equal((await GET(new Request("http://localhost/api/shopping-list/saved"))).status, 401);
    assert.equal((await (await GET(request())).json()).exists, false);
    const milk = item("melk");
    const bread = item("brood");
    await POST(request({ type: "initialize", items: [milk] }));
    await Promise.all([
      POST(request({ type: "add", items: [bread] })),
      POST(request({ type: "check", key: milk.key, checked: true }))
    ]);
    let saved = await (await GET(request())).json();
    assert.equal(saved.items.length, 2);
    assert.equal(saved.items.find((entry: PersistedShoppingListItem) => entry.key === milk.key).checked, true);
    assert.equal(saved.revision, 3);
    await POST(request({ type: "remove", key: milk.key }));
    await POST(request({ type: "initialize", items: [milk] }));
    saved = await (await GET(request())).json();
    assert.deepEqual(saved.items, [bread]);
    assert.equal(saved.revision, 4);
    assert.equal((await POST(request({ type: "check", key: milk.key, checked: true }))).status, 409);
    await POST(request({ type: "clear" }));
    await POST(request({ type: "initialize", items: [milk, bread] }));
    saved = await (await GET(request())).json();
    assert.equal(saved.exists, true);
    assert.deepEqual(saved.items, []);
    assert.equal(saved.revision, 5);
    assert.equal((await (await GET(request(undefined, "account-b"))).json()).exists, false);
  } finally {
    dbMock.mock.restore();
    authMock.mock.restore();
  }
});
