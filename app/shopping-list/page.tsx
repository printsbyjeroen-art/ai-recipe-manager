"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabaseBrowser } from "../../lib/supabase";

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
  isCustom?: boolean;
};

type ShoppingListEdit = {
  name: string;
  amount: string;
  unit: string;
};

type StoredShoppingListState = {
  checked: Record<string, boolean>;
  hidden: Record<string, boolean>;
  recipeEdits: Record<string, { name: string; amount: number; unit: string }>;
  customItems: ShoppingListItem[];
};

const EMPTY_STATE: StoredShoppingListState = {
  checked: {},
  hidden: {},
  recipeEdits: {},
  customItems: []
};

function formatAmount(amount: number) {
  if (!Number.isFinite(amount)) return "0";
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function parseAmount(value: string, fallback = 1) {
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function itemLabel(item: Pick<ShoppingListItem, "amount" | "unit" | "name">) {
  const amountText = formatAmount(item.amount);
  return [amountText, item.unit?.trim(), item.name].filter(Boolean).join(" ");
}

export default function ShoppingListPage() {
  const [weekStart, setWeekStart] = useState("");
  const [baseItems, setBaseItems] = useState<ShoppingListItem[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [recipeEdits, setRecipeEdits] = useState<Record<string, { name: string; amount: number; unit: string }>>({});
  const [customItems, setCustomItems] = useState<ShoppingListItem[]>([]);
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [newItem, setNewItem] = useState<ShoppingListEdit>({ name: "", amount: "1", unit: "" });
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ShoppingListEdit>({ name: "", amount: "1", unit: "" });

  const storageKey = useMemo(
    () => (userId && weekStart ? `shopping-list:v2:${userId}:${weekStart}` : null),
    [userId, weekStart]
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const {
          data: { user }
        } = await supabaseBrowser.auth.getUser();
        if (!user) {
          throw new Error("Please sign in first.");
        }
        setUserId(user.id);

        const res = await fetch(`/api/shopping-list?userId=${encodeURIComponent(user.id)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Failed to load shopping list");
        }

        setWeekStart(data.week_start || "");
        setBaseItems((data.items ?? []) as ShoppingListItem[]);
      } catch (err: any) {
        setError(err.message || "Failed to load shopping list");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    if (!storageKey) {
      setStorageReady(false);
      return;
    }

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setChecked({});
        setHidden({});
        setRecipeEdits({});
        setCustomItems([]);
      } else {
        const parsed = JSON.parse(raw);

        if (parsed && typeof parsed === "object" && "checked" in parsed) {
          const state = parsed as StoredShoppingListState;
          setChecked(state.checked ?? {});
          setHidden(state.hidden ?? {});
          setRecipeEdits(state.recipeEdits ?? {});
          setCustomItems((state.customItems ?? []).map((item) => ({ ...item, isCustom: true })));
        } else {
          setChecked(parsed ?? {});
          setHidden({});
          setRecipeEdits({});
          setCustomItems([]);
        }
      }
    } catch {
      setChecked({});
      setHidden({});
      setRecipeEdits({});
      setCustomItems([]);
    } finally {
      setStorageReady(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !storageReady) return;

    const state: StoredShoppingListState = {
      checked,
      hidden,
      recipeEdits,
      customItems
    };

    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [storageKey, storageReady, checked, hidden, recipeEdits, customItems]);

  const items = useMemo(() => {
    const mergedBase = baseItems
      .filter((item) => !hidden[item.key])
      .map((item) => {
        const edit = recipeEdits[item.key];
        return {
          ...item,
          name: edit?.name ?? item.name,
          amount: edit?.amount ?? item.amount,
          unit: edit?.unit ?? item.unit,
          isCustom: false
        };
      });

    const mergedCustom = customItems
      .filter((item) => !hidden[item.key])
      .map((item) => ({ ...item, isCustom: true }));

    return [...mergedCustom, ...mergedBase].sort((a, b) => {
      const checkedDelta = Number(!!checked[a.key]) - Number(!!checked[b.key]);
      if (checkedDelta !== 0) return checkedDelta;
      if (!!a.isCustom !== !!b.isCustom) {
        return Number(!!b.isCustom) - Number(!!a.isCustom);
      }
      return a.name.localeCompare(b.name);
    });
  }, [baseItems, checked, customItems, hidden, recipeEdits]);

  const checkedCount = items.filter((item) => checked[item.key]).length;
  const customCount = customItems.filter((item) => !hidden[item.key]).length;

  function toggleChecked(key: string, value: boolean) {
    setChecked((prev) => ({
      ...prev,
      [key]: value
    }));
  }

  function beginEdit(item: ShoppingListItem) {
    setEditingKey(item.key);
    setEditDraft({
      name: item.name,
      amount: formatAmount(item.amount),
      unit: item.unit
    });
  }

  function saveEdit() {
    if (!editingKey) return;

    const trimmedName = editDraft.name.trim();
    if (!trimmedName) return;

    const nextAmount = parseAmount(editDraft.amount);
    const nextUnit = editDraft.unit.trim();
    const customMatch = customItems.some((item) => item.key === editingKey);

    if (customMatch) {
      setCustomItems((prev) =>
        prev.map((item) =>
          item.key === editingKey
            ? {
                ...item,
                name: trimmedName,
                amount: nextAmount,
                unit: nextUnit,
                isCustom: true
              }
            : item
        )
      );
    } else {
      setRecipeEdits((prev) => ({
        ...prev,
        [editingKey]: {
          name: trimmedName,
          amount: nextAmount,
          unit: nextUnit
        }
      }));
    }

    setEditingKey(null);
  }

  function addCustomItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newItem.name.trim();
    if (!name) return;

    const item: ShoppingListItem = {
      key: `custom:${Date.now()}`,
      name,
      amount: parseAmount(newItem.amount),
      unit: newItem.unit.trim(),
      recipeCount: 0,
      recipes: [],
      isCustom: true
    };

    setCustomItems((prev) => [item, ...prev]);
    setNewItem({ name: "", amount: "1", unit: "" });
  }

  function deleteItem(item: ShoppingListItem) {
    if (item.isCustom) {
      setCustomItems((prev) => prev.filter((entry) => entry.key !== item.key));
    } else {
      setHidden((prev) => ({
        ...prev,
        [item.key]: true
      }));
    }

    setChecked((prev) => {
      const next = { ...prev };
      delete next[item.key];
      return next;
    });

    setOpenItems((prev) => {
      const next = { ...prev };
      delete next[item.key];
      return next;
    });

    if (editingKey === item.key) {
      setEditingKey(null);
    }
  }

  function clearWholeList() {
    if (!window.confirm("Delete the whole shopping list for this week?")) {
      return;
    }

    const nextHidden = { ...hidden };
    for (const item of baseItems) {
      nextHidden[item.key] = true;
    }

    setHidden(nextHidden);
    setCustomItems([]);
    setChecked({});
    setOpenItems({});
    setRecipeEdits({});
    setEditingKey(null);
  }

  function resetRecipeItems() {
    setHidden({});
    setRecipeEdits({});
    setChecked({});
    setOpenItems({});
    setEditingKey(null);
  }

  return (
    <div className="space-y-4">
      <motion.section
        className="rounded-lg bg-white p-4 shadow-sm"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Shopping list</h2>
            <p className="text-sm text-slate-600">
              Your all-in-one list for <span className="font-medium">{weekStart || "this week"}</span>: groceries, household items, and your own extras.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/weekmenu"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Back to week menu
            </a>
            <button
              type="button"
              onClick={resetRecipeItems}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Reset list
            </button>
            <button
              type="button"
              onClick={clearWholeList}
              className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Delete whole list
            </button>
          </div>
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {loading && <p className="mt-2 text-sm text-slate-600">Loading...</p>}

        {!loading && !error && (
          <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-600">
            <span className="rounded-full bg-slate-100 px-3 py-1">Checked {checkedCount} of {items.length}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1">My own items: {customCount}</span>
          </div>
        )}
      </motion.section>

      <motion.section
        className="rounded-lg bg-white p-4 shadow-sm"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <h3 className="text-base font-semibold text-slate-900">Add your own item</h3>
        <p className="mt-1 text-sm text-slate-600">Add anything you want: shampoo, trash bags, batteries, snacks, or extra ingredients.</p>

        <form onSubmit={addCustomItem} className="mt-3 grid gap-2 md:grid-cols-[1.5fr_120px_120px_auto]">
          <input
            type="text"
            value={newItem.name}
            onChange={(e) => setNewItem((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Item name"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-0 focus:border-blue-500"
          />
          <input
            type="text"
            value={newItem.amount}
            onChange={(e) => setNewItem((prev) => ({ ...prev, amount: e.target.value }))}
            placeholder="Amount"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-0 focus:border-blue-500"
          />
          <input
            type="text"
            value={newItem.unit}
            onChange={(e) => setNewItem((prev) => ({ ...prev, unit: e.target.value }))}
            placeholder="Unit"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-0 focus:border-blue-500"
          />
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add item
          </button>
        </form>
      </motion.section>

      <motion.section
        className="rounded-lg bg-white p-4 shadow-sm"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        {items.length === 0 && !loading ? (
          <p className="text-sm text-slate-600">Your shopping list is empty right now. Add your own item or fill your week menu first.</p>
        ) : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {items.map((item) => {
                const isChecked = !!checked[item.key];
                const isOpen = !!openItems[item.key];
                const isEditing = editingKey === item.key;

                return (
                  <motion.li
                    key={item.key}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    className="rounded border border-slate-200 bg-slate-50 px-3 py-3"
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => toggleChecked(item.key, e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-slate-300"
                      />

                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() =>
                            item.recipeCount > 0 &&
                            setOpenItems((prev) => ({
                              ...prev,
                              [item.key]: !prev[item.key]
                            }))
                          }
                          className="w-full text-left"
                        >
                          <div className={`text-sm font-medium ${isChecked ? "text-slate-400 line-through" : "text-slate-800"}`}>
                            {itemLabel(item)}
                          </div>
                          <div className="text-xs text-slate-500">
                            {item.isCustom
                              ? "Custom item you added yourself."
                              : `Used in ${item.recipeCount} recipe${item.recipeCount === 1 ? "" : "s"}${item.recipeCount > 0 ? `. Click to ${isOpen ? "hide" : "show"} recipes.` : "."}`}
                          </div>
                        </button>

                        <AnimatePresence>
                          {isEditing && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="mt-3 grid gap-2 md:grid-cols-[1.5fr_120px_120px_auto_auto]"
                            >
                              <input
                                type="text"
                                value={editDraft.name}
                                onChange={(e) => setEditDraft((prev) => ({ ...prev, name: e.target.value }))}
                                className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                              />
                              <input
                                type="text"
                                value={editDraft.amount}
                                onChange={(e) => setEditDraft((prev) => ({ ...prev, amount: e.target.value }))}
                                className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                              />
                              <input
                                type="text"
                                value={editDraft.unit}
                                onChange={(e) => setEditDraft((prev) => ({ ...prev, unit: e.target.value }))}
                                className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                              />
                              <button
                                type="button"
                                onClick={saveEdit}
                                className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingKey(null)}
                                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
                              >
                                Cancel
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {isOpen && item.recipes.length > 0 && (
                          <div className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-600">
                            <div className="mb-1 font-medium text-slate-700">Recipes</div>
                            <ul className="space-y-1">
                              {item.recipes.map((recipe) => (
                                <li key={`${item.key}:${recipe.id}`}>
                                  <a href={`/recipes/${recipe.id}`} className="text-blue-700 underline">
                                    {recipe.title}
                                  </a>{" "}
                                  <span className="text-slate-500">
                                    for {recipe.plannedServings} portion{recipe.plannedServings === 1 ? "" : "s"}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => beginEdit(item)}
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteItem(item)}
                          className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </motion.section>
    </div>
  );
}
