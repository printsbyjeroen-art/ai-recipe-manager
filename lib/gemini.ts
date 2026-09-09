import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Recipe } from "../types/recipe";

function describeGeminiError(error: unknown) {
  const err = error as {
    message?: string;
    name?: string;
    status?: number;
    statusText?: string;
    cause?: unknown;
    stack?: string;
  };

  return {
    name: err?.name,
    message: err?.message,
    status: err?.status,
    statusText: err?.statusText,
    cause: err?.cause instanceof Error ? err.cause.message : err?.cause,
    stack: err?.stack
  };
}

export async function generateGeminiContent(
  prompt: string,
  stage: "extract" | "normalize"
) {
  const startedAt = Date.now();
  console.info("[gemini] request started", {
    stage,
    model: "gemini-flash-latest",
    promptLength: prompt.length
  });

  try {
    const result = await getRecipeModel().generateContent(prompt);
    console.info("[gemini] request completed", {
      stage,
      durationMs: Date.now() - startedAt,
      responseLength: result.response.text().length
    });
    return result;
  } catch (error) {
    console.error("[gemini] request failed", {
      stage,
      durationMs: Date.now() - startedAt,
      error: describeGeminiError(error)
    });
    throw error;
  }
}

export function getRecipeModel() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GOOGLE_API_KEY");
  }

  return new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: "gemini-flash-latest"
  });
}

export const RECIPE_EXTRACTION_PROMPT = `
You are an assistant that extracts structured recipe data from arbitrary webpages.

Given the raw text content of a webpage that likely contains a recipe, extract a single recipe in the following JSON format:

{
  "title": string,
  "description": string,
  "servings": number,
  "calories_per_serving": number,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "meal_type": "breakfast" | "lunch" | "dinner" | "snack" | "dessert",
  "dish_type": "pasta" | "rice" | "soup" | "salad" | "wraps" | "oven dishes" | "baking" | "other",
  "prep_time": number,
  "cook_time": number,
  "ingredients": [
    {
      "name": string,
      "amount": number,
      "unit": string,
      "store_section": "produce" | "bakery" | "dairy" | "meat" | "fish" | "frozen" | "pantry" | "spices" | "drinks" | "snacks" | "household" | "miscellaneous"
    }
  ],
  "steps": [
    {
      "step_number": number,
      "instruction": string
    }
  ],
  "source_url": string
}

Rules:
- Always respond with only valid JSON, no explanations.
- All human-readable recipe text must always be in Dutch (Nederlands), even when the source page is in English or another language.
- Translate "title", "description", ingredient "name", ingredient "unit", and step "instruction" into natural Dutch.
- Keep enum values exactly in English for app compatibility: "meal_type", "dish_type", and "store_section" must stay within the allowed English values shown above.
- Prefer short Dutch cooking units where possible: "g", "ml", "el", "tl", "st", "teen", "blik", "bos", "snuf".
- Infer meal_type and dish_type from the recipe. If uncertain, use "other" for dish_type.
- If servings are not specified, infer a reasonable default (e.g. 2 or 4).
- Estimate calories_per_serving and macros (protein_g, carbs_g, fat_g) based on the ingredient list and amounts.
- Nutrition values must be per serving, in grams for macros.
- Use realistic rounded numbers (e.g. 27.5 for grams, 540 for kcal).
- For every ingredient, include a sensible grocery store section in "store_section". Use "miscellaneous" if unsure.
- Keep ingredient names concise, e.g. "olijfolie" instead of a long sentence.
- Keep step instructions clear and sequential in Dutch.
- Use numbers (minutes) for prep_time and cook_time. If not specified, make a reasonable estimate.
`;

export type DutchRecipeNormalizationResult = {
  detected_language: string;
  was_translated: boolean;
  recipe: Partial<Recipe>;
};

function stripJsonCodeFences(value: string) {
  return value.trim().replace(/^```json\s*|\s*```$/g, "");
}

export function parseGeminiJsonResponse<T>(value: string): T {
  return JSON.parse(stripJsonCodeFences(value)) as T;
}

export async function normalizeRecipeToDutch(recipe: Partial<Recipe>, existingIngredientNames: string[] = []) {
  const existingNames = existingIngredientNames.length
    ? existingIngredientNames.join(", ")
    : "(nog geen opgeslagen ingredienten)";
  const prompt = `
You are a recipe localization assistant for a Dutch cooking app.

Translate and normalize the recipe JSON below to Dutch.

Return exactly this JSON shape:
{
  "detected_language": "nl" | "en" | "mixed" | "other",
  "was_translated": boolean,
  "recipe": {
    "title": string,
    "description": string,
    "servings": number,
    "calories_per_serving": number,
    "protein_g": number,
    "carbs_g": number,
    "fat_g": number,
    "meal_type": "breakfast" | "lunch" | "dinner" | "snack" | "dessert",
    "dish_type": "pasta" | "rice" | "soup" | "salad" | "wraps" | "oven dishes" | "baking" | "other",
    "prep_time": number,
    "cook_time": number,
    "ingredients": [
      {
        "name": string,
        "amount": number,
        "unit": "g" | "ml",
        "store_section": "produce" | "bakery" | "dairy" | "meat" | "fish" | "frozen" | "pantry" | "spices" | "drinks" | "snacks" | "household" | "miscellaneous"
      }
    ],
    "steps": [
      {
        "step_number": number,
        "instruction": string
      }
    ],
    "source_url": string
  }
}

Rules:
- Always translate all user-facing text to natural Dutch.
- Keep "meal_type", "dish_type", and "store_section" enum values in English exactly as required above.
- Preserve numeric values as closely as possible.
- Convert every ingredient to grams (g) or milliliters (ml). Estimate common measures such as a handful of basilicum as about 10 g. Do not return units such as handje, bos, snuf, stuk, teen, el, or tl.
- Prefer an existing ingredient name from this user's database whenever it matches. Treat synonyms and variants as the same ingredient, for example "zeezout" and "keukenzout" become "zout".
- Use concise Dutch ingredient names and Dutch cooking instructions.
- Normalize units to Dutch-friendly abbreviations like "g", "ml", "el", "tl", "st", "teen", "blik", "bos", "snuf" when appropriate.
- Always respond with only valid JSON.

Recipe JSON:
${JSON.stringify(recipe)}

Existing ingredient names in this user's database:
${existingNames}
`;

  const result = await generateGeminiContent(prompt, "normalize");
  const parsed = parseGeminiJsonResponse<any>(result.response.text());

  return {
    detected_language: String(parsed?.detected_language ?? "unknown"),
    was_translated: Boolean(parsed?.was_translated),
    recipe: (parsed?.recipe ?? parsed) as Partial<Recipe>
  } satisfies DutchRecipeNormalizationResult;
}

