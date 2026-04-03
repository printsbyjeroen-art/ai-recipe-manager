"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { STORE_SECTIONS, displayStoreSection, normalizeIngredientName, normalizeStoreSection } from "../../lib/ingredients";
import { supabaseBrowser } from "../../lib/supabase";

type IngredientProfile = {
  name: string;
  normalized_name: string;
  default_unit: string;
  store_section: string;
  calories_per_100g: number;
  protein_g_per_100g: number;
  carbs_g_per_100g: number;
  fat_g_per_100g: number;
  usageCount: number;
  isLocalOnly?: boolean;
};

function storageKeyForUser(userId: string) {
  return `ingredient-profiles:v2:${userId}`;
}

function readLocalProfiles(userId: string) {
  if (typeof window === "undefined") return [] as IngredientProfile[];
  try {
    const raw = window.localStorage.getItem(storageKeyForUser(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalProfiles(userId: string, items: IngredientProfile[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKeyForUser(userId), JSON.stringify(items));
}

function mergeProfiles(dbProfiles: IngredientProfile[], localProfiles: IngredientProfile[]) {
  const map = new Map<string, IngredientProfile>();
  for (const item of dbProfiles) {
    map.set(item.normalized_name, item);
  }
  for (const item of localProfiles) {
    map.set(item.normalized_name, {
      ...(map.get(item.normalized_name) ?? item),
      ...item,
      isLocalOnly: item.isLocalOnly ?? !map.has(item.normalized_name)
    });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export default function IngredientsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<IngredientProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newProfile, setNewProfile] = useState<IngredientProfile>({
    name: "",
    normalized_name: "",
    default_unit: "",
    store_section: "miscellaneous",
    calories_per_100g: 0,
    protein_g_per_100g: 0,
    carbs_g_per_100g: 0,
    fat_g_per_100g: 0,
    usageCount: 0,
    isLocalOnly: true
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

        const res = await fetch(`/api/ingredients?userId=${encodeURIComponent(user.id)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Failed to load ingredients");
        }

        setProfiles(mergeProfiles((data.ingredients ?? []) as IngredientProfile[], readLocalProfiles(user.id)));
      } catch (err: any) {
        setError(err.message || "Failed to load ingredients");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    if (!userId) return;
    writeLocalProfiles(userId, profiles.filter((item) => item.isLocalOnly));
  }, [profiles, userId]);

  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((item) => item.name.toLowerCase().includes(q) || item.store_section.toLowerCase().includes(q));
  }, [profiles, search]);

  async function saveProfile(profile: IngredientProfile) {
    if (!userId) return;
    setSavingKey(profile.normalized_name);
    setError(null);
    setMessage(null);

    try {
      const normalized = normalizeIngredientName(profile.name);
      const nextProfile = {
        ...profile,
        normalized_name: normalized,
        store_section: normalizeStoreSection(profile.store_section)
      };

      setProfiles((prev) => {
        const next = prev.filter((item) => item.normalized_name !== normalized);
        return [...next, nextProfile].sort((a, b) => a.name.localeCompare(b.name));
      });

      const res = await fetch("/api/ingredients", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...nextProfile, userId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to save ingredient profile");
      }
      setMessage(data.warning || `Saved ${profile.name}.`);
    } catch (err: any) {
      setError(err.message || "Failed to save ingredient profile");
    } finally {
      setSavingKey(null);
    }
  }

  async function deleteProfile(profile: IngredientProfile) {
    if (!userId) return;

    setProfiles((prev) => prev.filter((item) => item.normalized_name !== profile.normalized_name));
    setSavingKey(profile.normalized_name);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(
        `/api/ingredients?userId=${encodeURIComponent(userId)}&name=${encodeURIComponent(profile.name)}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to remove ingredient profile");
      }
      setMessage(`Removed ${profile.name} from the ingredient tab.`);
    } catch (err: any) {
      setError(err.message || "Failed to remove ingredient profile");
    } finally {
      setSavingKey(null);
    }
  }

  function addNewProfile() {
    const trimmed = newProfile.name.trim();
    if (!trimmed) return;

    const profile: IngredientProfile = {
      ...newProfile,
      name: trimmed,
      normalized_name: normalizeIngredientName(trimmed),
      store_section: normalizeStoreSection(newProfile.store_section),
      isLocalOnly: true
    };

    setProfiles((prev) => mergeProfiles(prev, [profile]));
    setNewProfile({
      name: "",
      normalized_name: "",
      default_unit: "",
      store_section: "miscellaneous",
      calories_per_100g: 0,
      protein_g_per_100g: 0,
      carbs_g_per_100g: 0,
      fat_g_per_100g: 0,
      usageCount: 0,
      isLocalOnly: true
    });
    setMessage(`${trimmed} added to your ingredient tab.`);
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
            <h2 className="text-lg font-semibold">Ingredients</h2>
            <p className="text-sm text-slate-600">
              Manage saved ingredient nutrition and grocery-store sections so the app remembers them next time.
            </p>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ingredients or section"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm md:max-w-xs"
          />
        </div>
        {loading && <p className="mt-2 text-sm text-slate-600">Loading...</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {message && <p className="mt-2 text-sm text-emerald-700">{message}</p>}
      </motion.section>

      <motion.section
        className="rounded-lg bg-white p-4 shadow-sm"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <h3 className="text-base font-semibold">Add ingredient profile</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-[1.4fr_110px_160px_110px_110px_110px_110px_auto]">
          <input
            type="text"
            value={newProfile.name}
            onChange={(e) => setNewProfile((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Ingredient name"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={newProfile.default_unit}
            onChange={(e) => setNewProfile((prev) => ({ ...prev, default_unit: e.target.value }))}
            placeholder="Unit"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={newProfile.store_section}
            onChange={(e) => setNewProfile((prev) => ({ ...prev, store_section: e.target.value }))}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {STORE_SECTIONS.map((section) => (
              <option key={section} value={section}>
                {displayStoreSection(section)}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            value={newProfile.calories_per_100g}
            onChange={(e) => setNewProfile((prev) => ({ ...prev, calories_per_100g: Number(e.target.value) || 0 }))}
            placeholder="kcal"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={0}
            step="0.1"
            value={newProfile.protein_g_per_100g}
            onChange={(e) => setNewProfile((prev) => ({ ...prev, protein_g_per_100g: Number(e.target.value) || 0 }))}
            placeholder="Protein"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={0}
            step="0.1"
            value={newProfile.carbs_g_per_100g}
            onChange={(e) => setNewProfile((prev) => ({ ...prev, carbs_g_per_100g: Number(e.target.value) || 0 }))}
            placeholder="Carbs"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={0}
            step="0.1"
            value={newProfile.fat_g_per_100g}
            onChange={(e) => setNewProfile((prev) => ({ ...prev, fat_g_per_100g: Number(e.target.value) || 0 }))}
            placeholder="Fat"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={addNewProfile}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add
          </button>
        </div>
      </motion.section>

      <motion.section
        className="rounded-lg bg-white p-4 shadow-sm"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        {filteredProfiles.length === 0 ? (
          <p className="text-sm text-slate-600">No saved ingredients yet.</p>
        ) : (
          <div className="space-y-3">
            {filteredProfiles.map((profile) => (
              <div key={profile.normalized_name} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="grid gap-2 md:grid-cols-[1.3fr_100px_150px_100px_100px_100px_100px_auto_auto] md:items-center">
                  <div>
                    <div className="font-medium text-slate-900">{profile.name}</div>
                    <div className="text-xs text-slate-500">Used {profile.usageCount} time{profile.usageCount === 1 ? "" : "s"}</div>
                  </div>
                  <input
                    type="text"
                    value={profile.default_unit}
                    onChange={(e) =>
                      setProfiles((prev) =>
                        prev.map((item) =>
                          item.normalized_name === profile.normalized_name
                            ? { ...item, default_unit: e.target.value }
                            : item
                        )
                      )
                    }
                    className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                  />
                  <select
                    value={profile.store_section}
                    onChange={(e) =>
                      setProfiles((prev) =>
                        prev.map((item) =>
                          item.normalized_name === profile.normalized_name
                            ? { ...item, store_section: e.target.value }
                            : item
                        )
                      )
                    }
                    className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                  >
                    {STORE_SECTIONS.map((section) => (
                      <option key={section} value={section}>
                        {displayStoreSection(section)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    value={profile.calories_per_100g}
                    onChange={(e) =>
                      setProfiles((prev) =>
                        prev.map((item) =>
                          item.normalized_name === profile.normalized_name
                            ? { ...item, calories_per_100g: Number(e.target.value) || 0 }
                            : item
                        )
                      )
                    }
                    className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={profile.protein_g_per_100g}
                    onChange={(e) =>
                      setProfiles((prev) =>
                        prev.map((item) =>
                          item.normalized_name === profile.normalized_name
                            ? { ...item, protein_g_per_100g: Number(e.target.value) || 0 }
                            : item
                        )
                      )
                    }
                    className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={profile.carbs_g_per_100g}
                    onChange={(e) =>
                      setProfiles((prev) =>
                        prev.map((item) =>
                          item.normalized_name === profile.normalized_name
                            ? { ...item, carbs_g_per_100g: Number(e.target.value) || 0 }
                            : item
                        )
                      )
                    }
                    className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={profile.fat_g_per_100g}
                    onChange={(e) =>
                      setProfiles((prev) =>
                        prev.map((item) =>
                          item.normalized_name === profile.normalized_name
                            ? { ...item, fat_g_per_100g: Number(e.target.value) || 0 }
                            : item
                        )
                      )
                    }
                    className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => saveProfile(profile)}
                    disabled={savingKey === profile.normalized_name}
                    className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {savingKey === profile.normalized_name ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteProfile(profile)}
                    disabled={savingKey === profile.normalized_name}
                    className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.section>
    </div>
  );
}
