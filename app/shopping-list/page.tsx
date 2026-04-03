"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  displayStoreSection,
  normalizeStoreSection,
  STORE_SECTIONS
} from "../../lib/ingredients";
import {
  buildShoppingListItemKey,
  mergeIntoShoppingList,
  mergeShoppingListItems,
  type PersistedShoppingListItem,
  readShoppingListFromStorage,
  writeShoppingListToStorage
} from "../../lib/shopping-list-storage";
import { supabaseBrowser } from "../../lib/supabase";

type ShoppingListEdit = {
  name: string;
  amount: string;
  unit: string;
  store_section: string;
};

function formatAmount(amount: number) {
  if (!Number.isFinite(amount)) return "0";
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function parseAmount(value: string, fallback = 1) {
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function itemLabel(item: Pick<PersistedShoppingListItem, "amount" | "unit" | "name">) {
  const amountText = formatAmount(item.amount);
  return [amountText, item.unit?.trim(), item.name].filter(Boolean).join(" ");
}

export default function ShoppingListPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<PersistedShoppingListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});
  const [newItem, setNewItem] = useState<ShoppingListEdit>({
    name: "",
    amount: "1",
    unit: "",
    store_section: "miscellaneous"
  });
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ShoppingListEdit>({
    name: "",
    amount: "1",
    unit: "",
    store_section: "miscellaneous"
  });

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
        setItems(readShoppingListFromStorage(user.id));
      } catch (err: any) {
        setError(err.message || "Failed to load shopping list");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  function saveItems(nextItems: PersistedShoppingListItem[]) {
    setItems(nextItems);
    if (userId) {
      writeShoppingListToStorage(userId, nextItems);
    }
  }

  async function exportCurrentWeek() {
    if (!userId) return;

    setExporting(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/shopping-list?userId=${encodeURIComponent(userId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to export current week menu");
      }

      const merged = mergeIntoShoppingList(
        userId,
        (data.items ?? []).map((item: PersistedShoppingListItem) => ({
          ...item,
          checked: false,
          isCustom: false
        }))
      );

      setItems(merged);
      setMessage(
        `Exported ${(data.items ?? []).length} ingredient${(data.items ?? []).length === 1 ? "" : "s"}. Your list keeps everything until you delete it.`
      );
    } catch (err: any) {
      setError(err.message || "Failed to export current week menu");
    } finally {
      setExporting(false);
    }
  }

  function toggleChecked(key: string, value: boolean) {
    saveItems(items.map((item) => (item.key === key ? { ...item, checked: value } : item)));
  }

  function beginEdit(item: PersistedShoppingListItem) {
    setEditingKey(item.key);
    setEditDraft({
      name: item.name,
      amount: formatAmount(item.amount),
      unit: item.unit,
      store_section: normalizeStoreSection(item.store_section)
    });
  }

  function saveEdit() {
    if (!editingKey) return;

    const trimmedName = editDraft.name.trim();
    if (!trimmedName) return;

    const updatedItems = items.map((item) => {
      if (item.key !== editingKey) {
        return item;
      }

      const nextSection = normalizeStoreSection(editDraft.store_section);
      return {
        ...item,
        key: buildShoppingListItemKey(trimmedName, editDraft.unit.trim(), nextSection),
        name: trimmedName,
        amount: parseAmount(editDraft.amount),
        unit: editDraft.unit.trim(),
        store_section: nextSection
      };
    });

    saveItems(mergeShoppingListItems([], updatedItems));
    setEditingKey(null);
  }

  function addCustomItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newItem.name.trim();
    if (!name) return;

    const item: PersistedShoppingListItem = {
      key: buildShoppingListItemKey(name, newItem.unit.trim(), newItem.store_section),
      name,
      amount: parseAmount(newItem.amount),
      unit: newItem.unit.trim(),
      store_section: normalizeStoreSection(newItem.store_section),
      recipeCount: 0,
      recipes: [],
      checked: false,
      isCustom: true
    };

    saveItems(mergeShoppingListItems(items, [item]));
    setNewItem({ name: "", amount: "1", unit: "", store_section: "miscellaneous" });
    setMessage(`${name} added to your shopping list.`);
  }

  function deleteItem(item: PersistedShoppingListItem) {
    saveItems(items.filter((entry) => entry.key !== item.key));
    if (editingKey === item.key) {
      setEditingKey(null);
    }
  }

  function clearWholeList() {
    if (!window.confirm("Delete the whole shopping list?")) {
      return;
    }

    saveItems([]);
    setOpenItems({});
    setEditingKey(null);
    setMessage("Shopping list cleared.");
  }

  function clearChecks() {
    saveItems(items.map((item) => ({ ...item, checked: false })));
  }

  const checkedCount = items.filter((item) => item.checked).length;
  const customCount = items.filter((item) => item.isCustom).length;

  const groupedItems = useMemo(() => {
    const groups = new Map<string, PersistedShoppingListItem[]>();

    for (const item of items) {
      const section = normalizeStoreSection(item.store_section);
      if (!groups.has(section)) {
        groups.set(section, []);
      }
      groups.get(section)!.push(item);
    }

    return [...groups.entries()]
      .map(([section, sectionItems]) => [
        section,
        [...sectionItems].sort((a, b) => {
          const checkedDiff = Number(!!a.checked) - Number(!!b.checked);
          if (checkedDiff !== 0) return checkedDiff;
          return a.name.localeCompare(b.name);
        })
      ] as const)
      .sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

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
              Your all-in-one shopping list stays here until you delete the list or remove individual items.
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
              onClick={exportCurrentWeek}
              disabled={exporting || loading || !userId}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {exporting ? "Exporting..." : "Export current week"}
            </button>
            <button
              type="button"
              onClick={clearChecks}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Uncheck all
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
        {message && <p className="mt-2 text-sm text-emerald-700">{message}</p>}
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
        <p className="mt-1 text-sm text-slate-600">
          Add anything you want: groceries, batteries, shampoo, trash bags, or other household items.
        </p>

        <form onSubmit={addCustomItem} className="mt-3 grid gap-2 md:grid-cols-[1.3fr_100px_100px_170px_auto]">
          <input
            type="text"
            value={newItem.name}
            onChange={(e) => setNewItem((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Item name"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={newItem.amount}
            onChange={(e) => setNewItem((prev) => ({ ...prev, amount: e.target.value }))}
            placeholder="Amount"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={newItem.unit}
            onChange={(e) => setNewItem((prev) => ({ ...prev, unit: e.target.value }))}
            placeholder="Unit"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={newItem.store_section}
            onChange={(e) => setNewItem((prev) => ({ ...prev, store_section: e.target.value }))}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {STORE_SECTIONS.map((section) => (
              <option key={section} value={section}>
                {displayStoreSection(section)}
              </option>
            ))}
          </select>
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
        {groupedItems.length === 0 && !loading ? (
          <p className="text-sm text-slate-600">
            Your shopping list is empty right now. Export your week menu or add your own items.
          </p>
        ) : (
          <div className="space-y-4">
            {groupedItems.map(([section, sectionItems]) => (
              <div key={section}>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
                  {displayStoreSection(section)}
                </h3>
                <ul className="space-y-2">
                  <AnimatePresence initial={false}>
                    {sectionItems.map((item) => {
                      const isEditing = editingKey === item.key;
                      const isOpen = !!openItems[item.key];
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
                              checked={!!item.checked}
                              onChange={(e) => toggleChecked(item.key, e.target.checked)}
                              className="mt-1 h-4 w-4 rounded border-slate-300"
                            />

                            <div className="min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() =>
                                  item.recipes?.length
                                    ? setOpenItems((prev) => ({ ...prev, [item.key]: !prev[item.key] }))
                                    : null
                                }
                                className="w-full text-left"
                              >
                                <div className={`text-sm font-medium ${item.checked ? "text-slate-400 line-through" : "text-slate-800"}`}>
                                  {itemLabel(item)}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {item.isCustom
                                    ? "Custom item you added yourself."
                                    : `Exported from your week menu${item.recipeCount ? ` · ${item.recipeCount} recipe${item.recipeCount === 1 ? "" : "s"}` : ""}.`}
                                </div>
                              </button>

                              <AnimatePresence>
                                {isEditing && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="mt-3 grid gap-2 md:grid-cols-[1.3fr_100px_100px_170px_auto_auto]"
                                  >
                                    <input
                                      type="text"
                                      value={editDraft.name}
                                      onChange={(e) => setEditDraft((prev) => ({ ...prev, name: e.target.value }))}
                                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                                    />
                                    <input
                                      type="text"
                                      value={editDraft.amount}
                                      onChange={(e) => setEditDraft((prev) => ({ ...prev, amount: e.target.value }))}
                                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                                    />
                                    <input
                                      type="text"
                                      value={editDraft.unit}
                                      onChange={(e) => setEditDraft((prev) => ({ ...prev, unit: e.target.value }))}
                                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                                    />
                                    <select
                                      value={editDraft.store_section}
                                      onChange={(e) => setEditDraft((prev) => ({ ...prev, store_section: e.target.value }))}
                                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                                    >
                                      {STORE_SECTIONS.map((sectionOption) => (
                                        <option key={sectionOption} value={sectionOption}>
                                          {displayStoreSection(sectionOption)}
                                        </option>
                                      ))}
                                    </select>
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

                              {isOpen && (item.recipes?.length ?? 0) > 0 && (
                                <div className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-600">
                                  <div className="mb-1 font-medium text-slate-700">Recipes</div>
                                  <ul className="space-y-1">
                                    {(item.recipes ?? []).map((recipe) => (
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
              </div>
            ))}
          </div>
        )}
      </motion.section>
    </div>
  );
}
