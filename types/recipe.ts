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
  id?: string;
  recipe_id?: string;
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
  id?: string;
  recipe_id?: string;
  step_number: number;
  instruction: string;
}

export interface Recipe {
  id?: string;
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
  text_scaling_version?: number;
  created_at?: string;
  ingredients: Ingredient[];
  steps: Step[];
}

