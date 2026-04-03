import { supabaseAdmin } from "./supabase";
import { recipeModel, RECIPE_EXTRACTION_PROMPT } from "./gemini";
import * as cheerio from "cheerio";

export type ImportQueueStatus = "pending" | "processing" | "failed" | "completed";

export interface ImportQueueItem {
  id: number;
  user_id?: string | null;
  url: string;
  status: ImportQueueStatus;
  error: string | null;
  response_text?: string | null;
  recipe_id: number | null;
  process_after?: string | null;
  created_at: string;
  updated_at: string;
  last_attempt_at: string | null;
}

function isTransientError(err: any): boolean {
  const status = err?.status ?? err?.response?.status;
  if (typeof status === "number" && [408, 429, 500, 502, 503, 504].includes(status)) {
    return true;
  }
  const msg = String(err?.message ?? "").toLowerCase();
  return (
    msg.includes("resource exhausted") ||
    msg.includes("rate limit") ||
    msg.includes("high demand") ||
    msg.includes("spikes in demand") ||
    msg.includes("[503") ||
    msg.includes("503") ||
    msg.includes("service unavailable") ||
    msg.includes("temporarily") ||
    msg.includes("unavailable") ||
    msg.includes("fetch failed") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("socket hang up")
  );
}

function isPermanentPageError(message: string): boolean {
  // If we have an explicit HTTP 4xx from the recipe page, retrying won't help much.
  return /failed to fetch page:\s*4\d\d/i.test(message);
}

function num(value: any, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function fetchPageText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch page: ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  $("script, style, noscript").remove();

  const text = $("body").text();
  return text.replace(/\s+/g, " ").trim();
}

export async function processQueueItem(
  item: ImportQueueItem,
  ownerUserId?: string
): Promise<{ ok: boolean; recipeId?: number; error?: string; rawResponse?: string }> {
  const now = new Date().toISOString();

  // mark as processing and clear previous response_text
  await supabaseAdmin
    .from("import_queue")
    .update({ status: "processing", last_attempt_at: now, updated_at: now, response_text: null })
    .eq("id", item.id);

  let raw: string | undefined;

  try {
    const recipeOwnerId = item.user_id ?? ownerUserId;
    if (!recipeOwnerId) {
      throw new Error("Queue item is missing user_id. Remove and re-import this URL.");
    }

    const pageText = await fetchPageText(item.url);

    const prompt = `${RECIPE_EXTRACTION_PROMPT}

Webpage URL: ${item.url}

Webpage content:
${pageText}`;

    const result = await recipeModel.generateContent(prompt);
    raw = result.response.text();
    raw = raw.trim().replace(/^```json\s*|\s*```$/g, "");

    // store raw response for visibility/debugging
    await supabaseAdmin
      .from("import_queue")
      .update({ response_text: raw })
      .eq("id", item.id);

    const recipe = JSON.parse(raw);
    recipe.source_url = item.url;

    const { data: created, error: dbError } = await supabaseAdmin
      .from("recipes")
      .insert({
        user_id: recipeOwnerId,
        title: recipe.title,
        description: recipe.description,
        servings: num(recipe.servings, 1),
        calories_per_serving: num(recipe.calories_per_serving),
        protein_g: num(recipe.protein_g),
        carbs_g: num(recipe.carbs_g),
        fat_g: num(recipe.fat_g),
        meal_type: recipe.meal_type,
        dish_type: recipe.dish_type,
        prep_time: num(recipe.prep_time),
        cook_time: num(recipe.cook_time),
        source_url: recipe.source_url
      })
      .select("*")
      .single();

    if (dbError || !created) {
      throw new Error(dbError?.message || "Failed to save recipe");
    }

    const recipeId = created.id as number;

    if (Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0) {
      await supabaseAdmin.from("ingredients").insert(
        recipe.ingredients.map((i: any) => ({
          recipe_id: recipeId,
          name: i.name,
          amount: i.amount,
          unit: i.unit
        }))
      );
    }

    if (Array.isArray(recipe.steps) && recipe.steps.length > 0) {
      await supabaseAdmin.from("steps").insert(
        recipe.steps.map((s: any) => ({
          recipe_id: recipeId,
          step_number: s.step_number,
          instruction: s.instruction
        }))
      );
    }

    await supabaseAdmin
      .from("import_queue")
      .update({
        status: "completed",
        recipe_id: recipeId,
        error: null,
        updated_at: now
      })
      .eq("id", item.id);

    return { ok: true, recipeId, rawResponse: raw };
  } catch (err: any) {
    const message = err?.message || "Unknown error during import";
    const transient = isTransientError(err) && !isPermanentPageError(message);

    await supabaseAdmin
      .from("import_queue")
      .update({
        status: transient ? "pending" : "failed",
        // Keep last error for visibility even if pending.
        error: transient ? message : message,
        response_text: raw ?? message,
        updated_at: now
      })
      .eq("id", item.id);

    return { ok: false, error: message, rawResponse: raw };
  }
}

export async function retryDueImports(maxAgeMinutes = 5) {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  // Only pick up items that are past their process_after delay (if any).
  let { data, error } = await supabaseAdmin
    .from("import_queue")
    .select("*")
    .in("status", ["pending", "failed"])
    .or(`last_attempt_at.is.null,last_attempt_at.lt.${cutoff}`)
    .or(`process_after.is.null,process_after.lte.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(10);

  // If process_after column doesn't exist yet, fall back to the old query.
  if (error && String(error.message ?? "").toLowerCase().includes("process_after")) {
    ({ data, error } = await supabaseAdmin
      .from("import_queue")
      .select("*")
      .in("status", ["pending", "failed"])
      .or(`last_attempt_at.is.null,last_attempt_at.lt.${cutoff}`)
      .order("created_at", { ascending: true })
      .limit(10));
  }

  if (error || !data || data.length === 0) {
    return { processed: 0 };
  }

  let processed = 0;
  for (const item of data as ImportQueueItem[]) {
    // Skip permanent failures; keep retrying transient ones.
    if (item.status === "failed") {
      const transient = isTransientError({ message: item.error ?? "" });
      if (!transient) continue;
    }
    await processQueueItem(item);
    processed += 1;
  }

  return { processed };
}

