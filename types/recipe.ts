export type MealType = "breakfast" | "lunch" | "dinner" | "snack" | "dessert";

export type DishType =
  | "pasta"
  | "rice"
  | "soup"
  | "salad"
  | "wraps"
  | "oven dishes"
  | "baking"
  | "other";

export interface Ingredient {
  id?: number;
  recipe_id?: number;
  name: string;
  amount: number;
  unit: string;
  store_section?: string;
  calories_per_100g?: number;
  protein_g_per_100g?: number;
  carbs_g_per_100g?: number;
  fat_g_per_100g?: number;
}

export interface Step {
  id?: number;
  recipe_id?: number;
  step_number: number;
  instruction: string;
}

export interface Recipe {
  id?: number;
  title: string;
  description: string;
  servings: number;
  calories_per_serving: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  meal_type: MealType;
  dish_type: DishType;
  prep_time: number;
  cook_time: number;
  source_url: string;
  created_at?: string;
  ingredients: Ingredient[];
  steps: Step[];
}

