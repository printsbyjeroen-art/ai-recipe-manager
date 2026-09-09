import * as cheerio from "cheerio";
import { guessStoreSection, normalizeStoreSection } from "./ingredients";
import {
  createRecipe,
  updateImportQueueItem,
  listRetryableImports,
  type ImportQueueItem
} from "./db";
import {
  normalizeRecipeToDutch,
  parseGeminiJsonResponse,
  generateGeminiContent,
  RECIPE_EXTRACTION_PROMPT
} from "./gemini";

export type { ImportQueueItem, ImportQueueStatus } from "./db";

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
  return /failed to fetch page:\s*4\d\d/i.test(message);
}

function num(value: any, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function fetchPageText(url: string): Promise<string> {
  const startedAt = Date.now();
  console.info("[import] page fetch started", { url });
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    }
  });
  if (!res.ok) {
    console.error("[import] page fetch failed", {
      url,
      status: res.status,
      durationMs: Date.now() - startedAt
    });
    throw new Error(`Failed to fetch page: ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  $("script, style, noscript").remove();

  const text = $("body").text();
  console.info("[import] page fetch completed", {
    url,
    durationMs: Date.now() - startedAt,
    textLength: text.length
  });
  return text.replace(/\s+/g, " ").trim();
}

export async function processQueueItem(
  item: ImportQueueItem,
  ownerUserId?: string
): Promise<{ ok: boolean; recipeId?: string; error?: string; rawResponse?: string }> {
  const now = new Date().toISOString();

  console.info("[import] queue attempt started", {
    queueId: item.id,
    url: item.url,
    attemptStartedAt: now
  });

  await updateImportQueueItem(item.id, {
    status: "processing",
    last_attempt_at: now,
    updated_at: now,
    response_text: null
  });

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

    const result = await generateGeminiContent(prompt, "extract");
    raw = result.response.text();

    let recipe = parseGeminiJsonResponse<any>(raw);
    try {
      const normalizedRecipe = await normalizeRecipeToDutch(recipe);
      recipe = normalizedRecipe.recipe;
    } catch (normalizationError: any) {
      console.warn("[import] Dutch normalization failed; using extracted recipe", {
        queueId: item.id,
        transient: isTransientError(normalizationError),
        message: normalizationError?.message
      });
    }
    recipe.source_url = item.url;
    raw = JSON.stringify(recipe, null, 2);

    await updateImportQueueItem(item.id, { response_text: raw });

    const recipeId = await createRecipe(recipeOwnerId, {
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
      source_url: recipe.source_url,
      ingredients: Array.isArray(recipe.ingredients)
        ? recipe.ingredients.map((i: any) => ({
            name: i.name,
            amount: i.amount,
            unit: i.unit,
            store_section: normalizeStoreSection(i.store_section || guessStoreSection(i.name)),
            calories_per_100g: Math.max(0, Number(i.calories_per_100g) || 0),
            protein_g_per_100g: Math.max(0, Number(i.protein_g_per_100g) || 0),
            carbs_g_per_100g: Math.max(0, Number(i.carbs_g_per_100g) || 0),
            fat_g_per_100g: Math.max(0, Number(i.fat_g_per_100g) || 0)
          }))
        : [],
      steps: Array.isArray(recipe.steps) ? recipe.steps : []
    });

    await updateImportQueueItem(item.id, {
      status: "completed",
      recipe_id: recipeId,
      error: null,
      updated_at: now
    });

    return { ok: true, recipeId, rawResponse: raw };
  } catch (err: any) {
    const message = err?.message || "Unknown error during import";
    const transient = isTransientError(err) && !isPermanentPageError(message);

    console.error("[import] queue attempt failed", {
      queueId: item.id,
      url: item.url,
      transient,
      error: {
        name: err?.name,
        message,
        status: err?.status,
        statusText: err?.statusText,
        cause: err?.cause instanceof Error ? err.cause.message : err?.cause,
        stack: err?.stack
      }
    });

    await updateImportQueueItem(item.id, {
      status: transient ? "pending" : "failed",
      error: message,
      response_text: raw ?? message,
      updated_at: now
    });

    return { ok: false, error: message, rawResponse: raw };
  }
}

export async function retryDueImports(maxAgeMinutes = 5) {
  const data = await listRetryableImports(maxAgeMinutes);

  if (data.length === 0) {
    return { processed: 0 };
  }

  let processed = 0;
  for (const item of data) {
    if (item.status === "failed") {
      const transient = isTransientError({ message: item.error ?? "" });
      if (!transient) continue;
    }
    await processQueueItem(item);
    processed += 1;
  }

  return { processed };
}
