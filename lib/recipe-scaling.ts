import type { Ingredient } from "../types/recipe";

const markerPattern = /\{\{ingredient:(\d+)\}\}/g;

function formatAmount(amount: number) {
  if (!Number.isFinite(amount)) return "0";
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function addScalingMarkers(text: string, ingredients: Ingredient[]) {
  let result = text;
  ingredients.forEach((ingredient, index) => {
    const amount = formatAmount(Number(ingredient.amount) || 0);
    if (!amount || !ingredient.unit?.trim()) return;
    const amountPattern = escapeRegExp(amount).replace("\\.", "[.,]");
    const unitPattern = escapeRegExp(ingredient.unit.trim());
    result = result.replace(new RegExp(`\\b${amountPattern}\\s*${unitPattern}\\b`, "i"), `{{ingredient:${index}}} ${ingredient.unit}`);
  });
  return result;
}

export function scaleRecipeText(text: string, ingredients: Ingredient[], factor: number) {
  return text.replace(markerPattern, (_match, indexText: string) => {
    const ingredient = ingredients[Number(indexText)];
    return ingredient ? formatAmount((Number(ingredient.amount) || 0) * factor) : _match;
  });
}