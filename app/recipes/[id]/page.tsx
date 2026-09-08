import { notFound } from "next/navigation";
import { getRecipeById } from "../../../lib/db";
import RecipeDetailClient from "./recipe-detail-client";

export default async function RecipePage({
  params
}: {
  params: { id: string };
}) {
  const recipe = await getRecipeById(params.id);
  if (!recipe) notFound();

  return <RecipeDetailClient recipe={recipe} />;
}
