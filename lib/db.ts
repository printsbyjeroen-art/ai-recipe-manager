import type { Ingredient, Recipe, Step } from "../types/recipe";
import { getAdminDb } from "./firebase-admin";
import { getWeekStartISO, WEEKMENU_SLOT } from "./weekmenu";
import { normalizeIngredientName } from "./ingredients";
import { addScalingMarkers } from "./recipe-scaling";

export type ImportQueueStatus = "pending" | "processing" | "failed" | "completed";

export interface ImportQueueItem {
  id: string;
  user_id?: string | null;
  url: string;
  status: ImportQueueStatus;
  error: string | null;
  response_text?: string | null;
  recipe_id: string | null;
  process_after?: string | null;
  created_at: string;
  updated_at: string;
  last_attempt_at: string | null;
}

const recipesCol = () => getAdminDb().collection("recipes");
const importQueueCol = () => getAdminDb().collection("importQueue");
const weekMenusCol = () => getAdminDb().collection("weekMenus");

function weekMenuDocId(userId: string, weekStart: string) {
  return `${userId}_${weekStart}`;
}

function mapRecipeDoc(id: string, data: FirebaseFirestore.DocumentData): Recipe {
  return {
    id,
    title: data.title ?? "",
    description: data.description ?? "",
    servings: Number(data.servings) || 1,
    calories_per_serving: Number(data.calories_per_serving) || 0,
    protein_g: Number(data.protein_g) || 0,
    carbs_g: Number(data.carbs_g) || 0,
    fat_g: Number(data.fat_g) || 0,
    meal_type: data.meal_type,
    dish_type: data.dish_type,
    prep_time: Number(data.prep_time) || 0,
    cook_time: Number(data.cook_time) || 0,
    source_url: data.source_url ?? "",
    text_scaling_version: Number(data.text_scaling_version) || undefined,
    created_at: data.created_at,
    ingredients: (data.ingredients ?? []) as Ingredient[],
    steps: (data.steps ?? []) as Step[]
  };
}

function normalizeIngredients(ingredients: Ingredient[] = []) {
  return ingredients.map((i) => ({
    name: i.name,
    amount: Number(i.amount) || 0,
    unit: i.unit,
    store_section: i.store_section ?? "miscellaneous",
    calories_per_100g: Math.max(0, Number(i.calories_per_100g) || 0),
    protein_g_per_100g: Math.max(0, Number(i.protein_g_per_100g) || 0),
    carbs_g_per_100g: Math.max(0, Number(i.carbs_g_per_100g) || 0),
    fat_g_per_100g: Math.max(0, Number(i.fat_g_per_100g) || 0)
  }));
}

function normalizeSteps(steps: Step[] = []) {
  return steps
    .map((s) => ({
      step_number: Number(s.step_number) || 0,
      instruction: s.instruction
    }))
    .sort((a, b) => a.step_number - b.step_number);
}

export async function listRecipes(
  userId: string,
  filters?: { search?: string | null; mealType?: string | null; dishType?: string | null }
) {
  const snap = await recipesCol()
    .where("userId", "==", userId)
    .orderBy("created_at", "desc")
    .get();

  let recipes = snap.docs.map((doc) => mapRecipeDoc(doc.id, doc.data()));

  if (filters?.mealType) {
    recipes = recipes.filter((r) => r.meal_type === filters.mealType);
  }
  if (filters?.dishType) {
    recipes = recipes.filter((r) => r.dish_type === filters.dishType);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    recipes = recipes.filter(
      (r) =>
        r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)
    );
  }

  return recipes.map(({ ingredients, steps, ...summary }) => summary);
}

export async function getRecipeById(id: string): Promise<Recipe | null> {
  const doc = await recipesCol().doc(id).get();
  if (!doc.exists) return null;
  return mapRecipeDoc(doc.id, doc.data()!);
}

export async function createRecipe(userId: string, recipe: Recipe) {
  const now = new Date().toISOString();
  const { ingredients, steps, id: _id, created_at: _created, ...fields } = recipe;

  const docRef = await recipesCol().add({
    userId,
    ...fields,
    description: addScalingMarkers(fields.description ?? "", ingredients),
    ingredients: normalizeIngredients(ingredients),
    steps: normalizeSteps(steps).map((step) => ({
      ...step,
      instruction: addScalingMarkers(step.instruction, ingredients)
    })),
    text_scaling_version: 1,
    created_at: now
  });

  return docRef.id;
}

export async function updateRecipe(id: string, recipe: Recipe) {
  const { ingredients, steps, id: _id, created_at, ...fields } = recipe;

  await recipesCol()
    .doc(id)
    .update({
      ...fields,
      ingredients: normalizeIngredients(ingredients),
      steps: normalizeSteps(steps)
    });
}

export async function deleteRecipe(id: string) {
  await recipesCol().doc(id).delete();
}

export async function listRecipesWithSourceUrl(userId: string) {
  const snap = await recipesCol()
    .where("userId", "==", userId)
    .orderBy("created_at", "desc")
    .get();

  return snap.docs
    .map((doc) => ({ id: doc.id, source_url: String(doc.data().source_url ?? "") }))
    .filter((r) => r.source_url.trim().length > 0);
}

export async function listDinnerRecipes(userId: string) {
  const snap = await recipesCol()
    .where("userId", "==", userId)
    .orderBy("created_at", "desc")
    .get();

  const dinner = snap.docs
    .filter((doc) => doc.data().meal_type === "dinner")
    .map((doc) => ({
      id: doc.id,
      servings: Number(doc.data().servings) || 1
    }));

  if (dinner.length > 0) return dinner;

  return snap.docs.map((doc) => ({
    id: doc.id,
    servings: Number(doc.data().servings) || 1
  }));
}

export async function listImportQueue(userId: string, limit = 50) {
  const snap = await importQueueCol()
    .where("userId", "==", userId)
    .orderBy("created_at", "asc")
    .limit(limit)
    .get();

  return snap.docs.map((doc) => mapImportQueueDoc(doc.id, doc.data()));
}

function mapImportQueueDoc(id: string, data: FirebaseFirestore.DocumentData): ImportQueueItem {
  return {
    id,
    user_id: data.userId ?? null,
    url: data.url,
    status: data.status as ImportQueueStatus,
    error: data.error ?? null,
    response_text: data.response_text ?? null,
    recipe_id: data.recipe_id ?? null,
    process_after: data.process_after ?? null,
    created_at: data.created_at,
    updated_at: data.updated_at,
    last_attempt_at: data.last_attempt_at ?? null
  };
}

export async function createImportQueueItem(input: {
  userId: string;
  url: string;
  process_after?: string | null;
}) {
  const now = new Date().toISOString();
  const docRef = await importQueueCol().add({
    userId: input.userId,
    url: input.url,
    status: "pending",
    error: null,
    response_text: null,
    recipe_id: null,
    process_after: input.process_after ?? null,
    created_at: now,
    updated_at: now,
    last_attempt_at: null
  });

  const doc = await docRef.get();
  return mapImportQueueDoc(doc.id, doc.data()!);
}

export async function updateImportQueueItem(
  id: string,
  patch: Partial<{
    status: ImportQueueStatus;
    error: string | null;
    response_text: string | null;
    recipe_id: string | null;
    updated_at: string;
    last_attempt_at: string | null;
  }>
) {
  await importQueueCol().doc(id).update(patch);
}

export async function deleteImportQueueItem(id: string) {
  await importQueueCol().doc(id).delete();
}

export async function listOpenImportQueue(userId: string) {
  const snap = await importQueueCol()
    .where("userId", "==", userId)
    .orderBy("created_at", "desc")
    .get();

  return snap.docs
    .map((doc) => ({
      id: doc.id,
      url: String(doc.data().url ?? ""),
      status: doc.data().status as ImportQueueStatus
    }))
    .filter((item) => ["pending", "processing", "failed"].includes(item.status));
}

export async function countRecentImports(userId: string, sinceIso: string) {
  const snap = await importQueueCol()
    .where("userId", "==", userId)
    .where("created_at", ">=", sinceIso)
    .get();
  return snap.size;
}

export async function listRetryableImports(maxAgeMinutes: number) {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  const snap = await importQueueCol().orderBy("created_at", "asc").limit(50).get();

  return snap.docs
    .map((doc) => mapImportQueueDoc(doc.id, doc.data()))
    .filter((item) => ["pending", "failed"].includes(item.status))
    .filter((item) => {
      if (item.last_attempt_at && item.last_attempt_at >= cutoff) return false;
      if (item.process_after && item.process_after > nowIso) return false;
      return true;
    })
    .slice(0, 10);
}

export type WeekMenuItemRecord = {
  id?: string;
  day_of_week: number;
  meal_slot: string;
  recipe_id: string | null;
  planned_servings: number | null;
  updated_at: string;
};

function defaultWeekMenuItems(now: string): WeekMenuItemRecord[] {
  return Array.from({ length: 7 }, (_, day) => ({
    day_of_week: day,
    meal_slot: WEEKMENU_SLOT,
    recipe_id: null,
    planned_servings: null,
    updated_at: now
  }));
}

export async function ensureWeekMenu(userId: string, weekStart = getWeekStartISO()) {
  const docId = weekMenuDocId(userId, weekStart);
  const ref = weekMenusCol().doc(docId);
  const existing = await ref.get();

  if (existing.exists) {
    return {
      id: docId,
      week_start_date: weekStart,
      items: (existing.data()?.items ?? []) as WeekMenuItemRecord[],
      ...existing.data()!
    };
  }

  const now = new Date().toISOString();
  const data = {
    userId,
    week_start_date: weekStart,
    created_at: now,
    items: defaultWeekMenuItems(now)
  };

  await ref.set(data);
  return { id: docId, ...data };
}

export async function getWeekMenuItems(userId: string, weekStart: string) {
  const menu = await ensureWeekMenu(userId, weekStart);
  const items = (menu.items ?? []) as WeekMenuItemRecord[];
  return {
    week_start: weekStart,
    menu_id: menu.id as string,
    items: items
      .filter((item) => item.meal_slot === WEEKMENU_SLOT)
      .sort((a, b) => a.day_of_week - b.day_of_week)
  };
}

export async function updateWeekMenuItem(
  userId: string,
  weekStart: string,
  dayOfWeek: number,
  patch: { recipe_id: string | null; planned_servings: number | null }
) {
  const menu = await ensureWeekMenu(userId, weekStart);
  const now = new Date().toISOString();
  const items = ((menu.items ?? []) as WeekMenuItemRecord[]).map((item) => {
    if (item.day_of_week !== dayOfWeek || item.meal_slot !== WEEKMENU_SLOT) {
      return item;
    }
    return {
      ...item,
      recipe_id: patch.recipe_id,
      planned_servings: patch.planned_servings,
      updated_at: now
    };
  });

  await weekMenusCol().doc(menu.id as string).update({ items });
  return items.find(
    (item) => item.day_of_week === dayOfWeek && item.meal_slot === WEEKMENU_SLOT
  );
}

export async function setWeekMenuItems(
  userId: string,
  weekStart: string,
  updates: Array<{ day_of_week: number; recipe_id: string | null; planned_servings: number | null }>
) {
  const menu = await ensureWeekMenu(userId, weekStart);
  const now = new Date().toISOString();
  const items = ((menu.items ?? []) as WeekMenuItemRecord[]).map((item) => {
    const update = updates.find((u) => u.day_of_week === item.day_of_week);
    if (!update || item.meal_slot !== WEEKMENU_SLOT) return item;
    return {
      ...item,
      recipe_id: update.recipe_id,
      planned_servings: update.planned_servings,
      updated_at: now
    };
  });

  await weekMenusCol().doc(menu.id as string).update({ items });
}

export async function getUserRecipeIngredientRows(userId: string) {
  const snap = await recipesCol().where("userId", "==", userId).get();
  const rows: Array<{
    recipe_id: string;
    name: string;
    unit: string;
    store_section?: string;
    calories_per_100g?: number;
    protein_g_per_100g?: number;
    carbs_g_per_100g?: number;
    fat_g_per_100g?: number;
  }> = [];

  for (const doc of snap.docs) {
    const ingredients = (doc.data().ingredients ?? []) as Ingredient[];
    for (const ingredient of ingredients) {
      rows.push({
        recipe_id: doc.id,
        name: ingredient.name,
        unit: ingredient.unit,
        store_section: ingredient.store_section,
        calories_per_100g: ingredient.calories_per_100g,
        protein_g_per_100g: ingredient.protein_g_per_100g,
        carbs_g_per_100g: ingredient.carbs_g_per_100g,
        fat_g_per_100g: ingredient.fat_g_per_100g
      });
    }
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

export async function updateIngredientProfileForUser(
  userId: string,
  _normalizedName: string,
  updatePayload: {
    store_section: string;
    calories_per_100g: number;
    protein_g_per_100g: number;
    carbs_g_per_100g: number;
    fat_g_per_100g: number;
    unit: string;
  },
  matchesName: (name: string) => boolean
) {
  const snap = await recipesCol().where("userId", "==", userId).get();
  const batch = getAdminDb().batch();
  let changed = 0;

  for (const doc of snap.docs) {
    const ingredients = (doc.data().ingredients ?? []) as Ingredient[];
    let touched = false;
    const nextIngredients = ingredients.map((ingredient) => {
      if (!matchesName(ingredient.name)) return ingredient;
      touched = true;
      return {
        ...ingredient,
        store_section: updatePayload.store_section,
        calories_per_100g: updatePayload.calories_per_100g,
        protein_g_per_100g: updatePayload.protein_g_per_100g,
        carbs_g_per_100g: updatePayload.carbs_g_per_100g,
        fat_g_per_100g: updatePayload.fat_g_per_100g,
        unit: updatePayload.unit || ingredient.unit
      };
    });

    if (touched) {
      batch.update(doc.ref, { ingredients: nextIngredients });
      changed += 1;
    }
  }

  if (changed > 0) {
    await batch.commit();
  }

  return changed > 0;
}

export async function renameIngredientForUser(userId: string, fromName: string, toName: string) {
  const snap = await recipesCol().where("userId", "==", userId).get();
  const normalizedFrom = normalizeIngredientName(fromName);
  const normalizedTo = normalizeIngredientName(toName);
  const updates: Array<{ ref: FirebaseFirestore.DocumentReference; ingredients: Ingredient[] }> = [];
  let changedRecipes = 0;
  let changedIngredients = 0;

  for (const doc of snap.docs) {
    const ingredients = (doc.data().ingredients ?? []) as Ingredient[];
    let touched = false;
    const nextIngredients = ingredients.map((ingredient) => {
      if (normalizeIngredientName(ingredient.name) !== normalizedFrom) return ingredient;
      touched = true;
      changedIngredients += 1;
      return { ...ingredient, name: normalizedTo };
    });

    if (touched) {
      updates.push({ ref: doc.ref, ingredients: nextIngredients });
      changedRecipes += 1;
    }
  }

  for (let index = 0; index < updates.length; index += 450) {
    const batch = getAdminDb().batch();
    for (const update of updates.slice(index, index + 450)) {
      batch.update(update.ref, { ingredients: update.ingredients });
    }
    await batch.commit();
  }

  return { changedRecipes, changedIngredients };
}
