import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GOOGLE_API_KEY;

if (!apiKey) {
  throw new Error("Missing GOOGLE_API_KEY");
}

const genAI = new GoogleGenerativeAI(apiKey);

export const recipeModel = genAI.getGenerativeModel({
  // Use the latest Flash model alias supported by the public Gemini API.
  model: "gemini-flash-latest"
});

export const RECIPE_EXTRACTION_PROMPT = `
You are an assistant that extracts structured recipe data from arbitrary webpages.

Given the raw text content of a webpage that likely contains a recipe, extract a single recipe in the following JSON format:

{
  "title": string,
  "description": string,
  "servings": number,
  "meal_type": "breakfast" | "lunch" | "dinner" | "snack" | "dessert",
  "dish_type": "pasta" | "rice" | "soup" | "salad" | "wraps" | "oven dishes" | "baking" | "other",
  "prep_time": number,
  "cook_time": number,
  "ingredients": [
    {
      "name": string,
      "amount": number,
      "unit": string
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
- Infer meal_type and dish_type from the recipe. If uncertain, use "other" for dish_type.
- If servings are not specified, infer a reasonable default (e.g. 2 or 4).
- Keep ingredient names concise, e.g. "olive oil" instead of "extra virgin olive oil, plus more for serving".
- Keep step instructions clear and sequential.
- Use numbers (minutes) for prep_time and cook_time. If not specified, make a reasonable estimate.
`;

