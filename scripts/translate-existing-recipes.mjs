import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const envPath = path.join(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  throw new Error(".env.local not found");
}

for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  if (!line || line.trim().startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i === -1) continue;
  const key = line.slice(0, i).trim();
  let val = line.slice(i + 1).trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  if (!(key in process.env)) process.env[key] = val;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const googleApiKey = process.env.GOOGLE_API_KEY;

if (!url || !serviceKey || !googleApiKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or GOOGLE_API_KEY"
  );
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const model = new GoogleGenerativeAI(googleApiKey).getGenerativeModel({
  model: "gemini-flash-latest"
});

const DRY_RUN = process.argv.includes("--dry-run");
const FALLBACK_ONLY = process.argv.includes("--fallback-only");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const userIdArg = process.argv.find((arg) => arg.startsWith("--user-id="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : null;
const USER_ID = userIdArg ? userIdArg.split("=")[1] : null;

function stripJsonCodeFences(value) {
  return value.trim().replace(/^```json\s*|\s*```$/g, "");
}

function recipeText(recipe) {
  return [
    recipe.title,
    recipe.description,
    ...(recipe.ingredients ?? []).map((item) => `${item.name} ${item.unit}`),
    ...(recipe.steps ?? []).map((step) => step.instruction)
  ]
    .join(" ")
    .toLowerCase();
}

function englishSignalCount(recipe) {
  const text = recipeText(recipe);
  const signals = [
    "with ",
    " and ",
    "mix",
    "stir",
    "bake",
    "cook",
    "serve",
    "bring",
    "boil",
    "then",
    "small",
    "thick",
    "thin",
    "covered",
    "hot ",
    "keep ",
    "mince",
    "bite-sized",
    "chicken",
    "beef",
    "salt",
    "pepper",
    "onion",
    "garlic",
    "tablespoon",
    "teaspoon",
    "cup ",
    "minutes"
  ];

  return signals.filter((signal) => text.includes(signal)).length;
}

function dutchSignalCount(recipe) {
  const text = recipeText(recipe);
  const signals = [
    " met ",
    " en ",
    "bak",
    "kook",
    "voeg",
    "meng",
    "serveer",
    "kip",
    "rund",
    "gehakt",
    "zout",
    "peper",
    "ui",
    "knoflook",
    "eetlepel",
    "theelepel",
    "minuten"
  ];

  return signals.filter((signal) => text.includes(signal)).length;
}

function shouldReviewWithAI(recipe) {
  const englishSignals = englishSignalCount(recipe);
  const dutchSignals = dutchSignalCount(recipe);

  return englishSignals >= 2 || englishSignals > dutchSignals || dutchSignals === 0;
}

function isTransientGeminiError(error) {
  const message = String(error?.message ?? error).toLowerCase();
  return (
    message.includes("503") ||
    message.includes("service unavailable") ||
    message.includes("high demand") ||
    message.includes("rate limit") ||
    message.includes("resource exhausted") ||
    message.includes("quota exceeded") ||
    message.includes("too many requests")
  );
}

async function generateWithRetry(prompt, attempts = 4) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await model.generateContent(prompt);
    } catch (error) {
      lastError = error;
      if (!isTransientGeminiError(error) || attempt === attempts) {
        throw error;
      }
      const waitMs = attempt * 2000;
      console.log(`  retrying Gemini request in ${waitMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw lastError ?? new Error("Gemini request failed");
}

function applyReplacements(text, replacements) {
  let output = String(text ?? "");
  for (const [pattern, replacement] of replacements) {
    output = output.replace(pattern, replacement);
  }
  return output.replace(/\s+/g, " ").trim();
}

const TEXT_REPLACEMENTS = [
  [/Vegetarian Risotto with Roasted Vegetables/gi, "Vegetarische risotto met geroosterde groenten"],
  [/Stir fried szechuan beef/gi, "Roergebakken Szechuan-rundvlees"],
  [/geServeererd/gi, "geserveerd"],
  [/Roostered/gi, "geroosterde"],
  [/A creamy/gi, "Een romige"],
  [/featuring/gi, "met"],
  [/finished with/gi, "afgemaakt met"],
  [/for a perfect vegetarian dinner/gi, "voor een perfect vegetarisch diner"],
  [/\band\b/gi, "en"],
  [/sweet potato/gi, "zoete aardappel"],
  [/kidney beans/gi, "kidneybonen"],
  [/canned diced tomatoes|canned tomato cubes/gi, "tomatenblokjes uit blik"],
  [/tomato paste/gi, "tomatenpuree"],
  [/tomato passata/gi, "tomatenpassata"],
  [/cauliflower rice/gi, "bloemkoolrijst"],
  [/gluten-free bread mix/gi, "glutenvrije broodmix"],
  [/instant yeast/gi, "instantgist"],
  [/red bell pepper/gi, "rode paprika"],
  [/yellow bell pepper/gi, "gele paprika"],
  [/bell peppers/gi, "paprika's"],
  [/bell pepper/gi, "paprika"],
  [/red pointed pepper/gi, "rode puntpaprika"],
  [/red onion/gi, "rode ui"],
  [/spring onions/gi, "lente-uitjes"],
  [/minced meat/gi, "gehakt"],
  [/lean bacon strips/gi, "magere spekreepjes"],
  [/dry white wine/gi, "droge witte wijn"],
  [/risotto rice/gi, "risottorijst"],
  [/soy sauce/gi, "sojasaus"],
  [/sesame oil/gi, "sesamolie"],
  [/cornstarch/gi, "maizena"],
  [/chicken stock/gi, "kippenbouillon"],
  [/chicken breast/gi, "kipfilet"],
  [/lemongrass/gi, "citroengras"],
  [/shallots/gi, "sjalotten"],
  [/galangal powder/gi, "laospoeder"],
  [/coconut milk/gi, "kokosmelk"],
  [/fish sauce/gi, "vissaus"],
  [/coconut sugar/gi, "kokossuiker"],
  [/oyster mushrooms/gi, "oesterzwammen"],
  [/fresh coriander|fresh cilantro|cilantro/gi, "verse koriander"],
  [/fresh parsley/gi, "verse peterselie"],
  [/fresh basil/gi, "verse basilicum"],
  [/noodles/gi, "noedels"],
  [/sugar/gi, "suiker"],
  [/beef/gi, "rundvlees"],
  [/garlic powder/gi, "knoflookpoeder"],
  [/garlic/gi, "knoflook"],
  [/ginger root|ginger/gi, "gember"],
  [/onion/gi, "ui"],
  [/mushrooms/gi, "champignons"],
  [/zucchini/gi, "courgette"],
  [/eggplant/gi, "aubergine"],
  [/carrot julienne/gi, "julienne van wortel"],
  [/carrots/gi, "wortels"],
  [/corn/gi, "maïs"],
  [/broth/gi, "bouillon"],
  [/paprika powder/gi, "paprikapoeder"],
  [/chili powder/gi, "chilipoeder"],
  [/cumin/gi, "komijn"],
  [/spinach/gi, "spinazie"],
  [/chickpeas/gi, "kikkererwten"],
  [/egg/gi, "ei"],
  [/rice/gi, "rijst"],
  [/Mexican spice mix/gi, "Mexicaanse kruidenmix"],
  [/olive oil/gi, "olijfolie"],
  [/black pepper/gi, "zwarte peper"],
  [/salt and pepper/gi, "zout en peper"],
  [/salt/gi, "zout"],
  [/pepper/gi, "peper"],
  [/grated cheese/gi, "geraspte kaas"],
  [/goat cheese/gi, "geitenkaas"],
  [/Greek yogurt/gi, "Griekse yoghurt"],
  [/Parmesan cheese|parmesan cheese/gi, "Parmezaanse kaas"],
  [/arugula/gi, "rucola"],
  [/cherry tomatoes/gi, "cherrytomaatjes"],
  [/cashews/gi, "cashewnoten"],
  [/naan bread/gi, "naanbrood"],
  [/sour cream/gi, "zure room"],
  [/taco sauce/gi, "tacosaus"],
  [/baby corn/gi, "mini-maïs"],
  [/snow peas/gi, "peultjes"],
  [/tortillas/gi, "tortilla's"],
  [/pieces/gi, "stuks"],
  [/piece/gi, "stuk"],
  [/cloves/gi, "teentjes"],
  [/tablespoons?|tbsp/gi, "el"],
  [/teaspoons?|tsp/gi, "tl"],
  [/handfuls/gi, "handjes"],
  [/handful/gi, "handje"],
  [/stalks/gi, "stengels"],
  [/bunch/gi, "bos"],
  [/pinches/gi, "snufjes"],
  [/pinch/gi, "snuf"],
  [/small can/gi, "klein blik"],
  [/large/gi, "groot"],
  [/to taste/gi, "naar smaak"]
];

const STEP_REPLACEMENTS = [
  [/Preheat the oven to/gi, "Verwarm de oven voor op"],
  [/Bring the chicken stock to a boil\./gi, "Breng de kippenbouillon aan de kook."],
  [/Bring the mixture to a boil\./gi, "Breng het geheel aan de kook."],
  [/In a bowl, mix/gi, "Meng in een kom"],
  [/Mix well/gi, "Meng goed"],
  [/according to the package instructions/gi, "volgens de aanwijzingen op de verpakking"],
  [/according to package instructions/gi, "volgens de aanwijzingen op de verpakking"],
  [/lined with parchment paper/gi, "bekleed met bakpapier"],
  [/baking sheet/gi, "bakplaat"],
  [/kitchen towel/gi, "schone theedoek"],
  [/squeeze out as much moisture as possible/gi, "knijp er zoveel mogelijk vocht uit"],
  [/cover with a damp cloth/gi, "dek af met een vochtige doek"],
  [/let it rise in a warm spot/gi, "laat het op een warme plek rijzen"],
  [/food processor/gi, "keukenmachine"],
  [/hand blender/gi, "staafmixer"],
  [/until smooth/gi, "tot een glad geheel"],
  [/set aside/gi, "zet apart"],
  [/keep warm/gi, "houd warm"],
  [/heat through/gi, "goed door"],
  [/over medium-high heat/gi, "op middelhoog vuur"],
  [/on low heat/gi, "op laag vuur"],
  [/low heat/gi, "laag vuur"],
  [/degrees Celsius/gi, "graden Celsius"],
  [/Bring to a boil/gi, "Breng aan de kook"],
  [/\bBring\b/gi, "Breng"],
  [/\bChop\b/gi, "Snijd"],
  [/\bthen\b/gi, "daarna"],
  [/\bsmall\b/gi, "kleine"],
  [/\bthick\b/gi, "dikke"],
  [/\bstrips\b/gi, "reepjes"],
  [/\bbite-sized\b/gi, "hapklare"],
  [/\bhard ends\b/gi, "harde uiteinden"],
  [/\bouter leaves\b/gi, "buitenste bladeren"],
  [/\bthin wedges\b/gi, "dunne partjes"],
  [/\bfinely mince\b/gi, "hak fijn"],
  [/\bto a boil\b/gi, "aan de kook"],
  [/\bto de soup\b/gi, "toe aan de soep"],
  [/\bto de bouillon\b/gi, "toe aan de bouillon"],
  [/\bthem\b/gi, "ze"],
  [/\bkeep it warm\b/gi, "houd dit warm"],
  [/\bde rundvlees\b/gi, "het rundvlees"],
  [/\bon low Verhit\b/gi, "op laag vuur"],
  [/Finely chop/gi, "Snipper"],
  [/Roughly chop/gi, "Hak grof"],
  [/Dice/gi, "Snijd in blokjes"],
  [/Slice/gi, "Snijd"],
  [/Cut/gi, "Snijd"],
  [/Place/gi, "Leg"],
  [/Spread/gi, "Verdeel"],
  [/Drizzle/gi, "Besprenkel"],
  [/Toss/gi, "Schep om"],
  [/Heat/gi, "Verhit"],
  [/Add/gi, "Voeg"],
  [/Stir-fry/gi, "Roerbak"],
  [/Stir in/gi, "Roer"],
  [/Stir/gi, "Roer"],
  [/Fry/gi, "Bak"],
  [/Roast/gi, "Rooster"],
  [/Cook/gi, "Kook"],
  [/Simmer/gi, "Laat zachtjes koken"],
  [/Drain/gi, "Giet af"],
  [/Remove/gi, "Haal"],
  [/Return/gi, "Doe"],
  [/Serve/gi, "Serveer"],
  [/Garnish/gi, "Garneer"],
  [/Pre-bake/gi, "Bak"],
  [/grill pan/gi, "grillpan"],
  [/\bthe\b/gi, "de"],
  [/\band\b/gi, "en"],
  [/\binto\b/gi, "in"],
  [/\bwith\b/gi, "met"],
  [/\buntil\b/gi, "tot"],
  [/\bfor\b/gi, "voor"],
  [/\babout\b/gi, "ongeveer"],
  [/\banother\b/gi, "nog"],
  [/\bapproximately\b/gi, "ongeveer"],
  [/\bminutes\b/gi, "minuten"],
  [/\bminute\b/gi, "minuut"],
  [/\bseconds\b/gi, "seconden"],
  [/\bsecond\b/gi, "seconde"],
  [/\blengthwise\b/gi, "in de lengte"],
  [/\bwell\b/gi, "goed"],
  [/\bbriefly\b/gi, "kort"],
  [/\bimmediately\b/gi, "direct"],
  [/\bsoften\b/gi, "zacht worden"],
  [/\bhot water\b/gi, "heet water"],
  [/\bdissolve\b/gi, "los"],
  [/\bcube\b/gi, "blokje"],
  [/\btranslucent\b/gi, "glazig"]
];

function translateGeneralText(text) {
  return applyReplacements(text, TEXT_REPLACEMENTS);
}

function translateStepText(text) {
  return applyReplacements(translateGeneralText(text), STEP_REPLACEMENTS);
}

function translateRecipeFallback(recipe) {
  return {
    ...recipe,
    title: translateGeneralText(recipe.title),
    description: translateGeneralText(recipe.description),
    ingredients: (recipe.ingredients ?? []).map((item) => ({
      ...item,
      name: translateGeneralText(item.name),
      unit: translateGeneralText(item.unit)
    })),
    steps: (recipe.steps ?? []).map((step) => ({
      ...step,
      instruction: translateStepText(step.instruction)
    }))
  };
}

async function normalizeRecipeToDutch(recipe) {
  if (FALLBACK_ONLY) {
    const englishSignals = englishSignalCount(recipe);
    const dutchSignals = dutchSignalCount(recipe);
    return {
      detected_language: englishSignals > dutchSignals ? "mixed" : "nl",
      was_translated: englishSignals > 0,
      recipe: translateRecipeFallback(recipe)
    };
  }

  const prompt = `
You are a recipe localization assistant for a Dutch cooking app.

Decide whether this recipe is already in Dutch. If it is not fully Dutch, translate it.

Return exactly this JSON:
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
    "source_url": string,
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
    ]
  }
}

Rules:
- Translate all user-facing text to natural Dutch.
- Keep meal_type, dish_type, and store_section enum values in English exactly as shown.
- Preserve numbers and source_url.
- Use short Dutch cooking units like g, ml, el, tl, st, teen, blik, bos, snuf when appropriate.
- Always respond with valid JSON only.

Recipe JSON:
${JSON.stringify(recipe)}
`;

  try {
    const result = await generateWithRetry(prompt);
    const parsed = JSON.parse(stripJsonCodeFences(result.response.text()));

    return {
      detected_language: String(parsed?.detected_language ?? "unknown"),
      was_translated: Boolean(parsed?.was_translated),
      recipe: parsed?.recipe ?? parsed
    };
  } catch (error) {
    if (!isTransientGeminiError(error)) {
      throw error;
    }

    console.log("  Gemini quota/rate limit hit; using fallback Dutch translator for this recipe.");
    const englishSignals = englishSignalCount(recipe);
    const dutchSignals = dutchSignalCount(recipe);
    return {
      detected_language: englishSignals > dutchSignals ? "mixed" : "nl",
      was_translated: englishSignals > 0,
      recipe: translateRecipeFallback(recipe)
    };
  }
}

async function fetchFullRecipes() {
  let query = supabase.from("recipes").select("*").order("created_at", { ascending: false });
  if (USER_ID) {
    query = query.eq("user_id", USER_ID);
  }
  if (LIMIT && Number.isFinite(LIMIT) && LIMIT > 0) {
    query = query.limit(LIMIT);
  }

  const { data: recipes, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch recipes: ${error.message}`);
  }

  const fullRecipes = [];
  for (const recipe of recipes ?? []) {
    const { data: ingredients, error: ingredientsError } = await supabase
      .from("ingredients")
      .select("*")
      .eq("recipe_id", recipe.id)
      .order("id", { ascending: true });

    if (ingredientsError) {
      throw new Error(`Failed to fetch ingredients for recipe ${recipe.id}: ${ingredientsError.message}`);
    }

    const { data: steps, error: stepsError } = await supabase
      .from("steps")
      .select("*")
      .eq("recipe_id", recipe.id)
      .order("step_number", { ascending: true });

    if (stepsError) {
      throw new Error(`Failed to fetch steps for recipe ${recipe.id}: ${stepsError.message}`);
    }

    fullRecipes.push({
      ...recipe,
      ingredients: ingredients ?? [],
      steps: steps ?? []
    });
  }

  return fullRecipes;
}

async function updateRecipeInDatabase(originalRecipe, localizedRecipe) {
  const { error: recipeError } = await supabase
    .from("recipes")
    .update({
      title: localizedRecipe.title,
      description: localizedRecipe.description,
      servings: Number(localizedRecipe.servings ?? originalRecipe.servings ?? 0),
      calories_per_serving: Number(
        localizedRecipe.calories_per_serving ?? originalRecipe.calories_per_serving ?? 0
      ),
      protein_g: Number(localizedRecipe.protein_g ?? originalRecipe.protein_g ?? 0),
      carbs_g: Number(localizedRecipe.carbs_g ?? originalRecipe.carbs_g ?? 0),
      fat_g: Number(localizedRecipe.fat_g ?? originalRecipe.fat_g ?? 0),
      meal_type: localizedRecipe.meal_type ?? originalRecipe.meal_type,
      dish_type: localizedRecipe.dish_type ?? originalRecipe.dish_type,
      prep_time: Number(localizedRecipe.prep_time ?? originalRecipe.prep_time ?? 0),
      cook_time: Number(localizedRecipe.cook_time ?? originalRecipe.cook_time ?? 0),
      source_url: localizedRecipe.source_url ?? originalRecipe.source_url ?? ""
    })
    .eq("id", originalRecipe.id);

  if (recipeError) {
    throw new Error(`Failed to update recipe ${originalRecipe.id}: ${recipeError.message}`);
  }

  const translatedIngredients = (localizedRecipe.ingredients ?? []).map((ingredient, index) => {
    const original = originalRecipe.ingredients[index] ?? {};
    return {
      recipe_id: originalRecipe.id,
      name: ingredient.name ?? original.name ?? "",
      amount: Number(ingredient.amount ?? original.amount ?? 0),
      unit: ingredient.unit ?? original.unit ?? "",
      store_section: ingredient.store_section ?? original.store_section ?? "miscellaneous",
      calories_per_100g: Number(original.calories_per_100g ?? 0),
      protein_g_per_100g: Number(original.protein_g_per_100g ?? 0),
      carbs_g_per_100g: Number(original.carbs_g_per_100g ?? 0),
      fat_g_per_100g: Number(original.fat_g_per_100g ?? 0)
    };
  });

  const translatedSteps = (localizedRecipe.steps ?? []).map((step, index) => {
    const original = originalRecipe.steps[index] ?? {};
    return {
      recipe_id: originalRecipe.id,
      step_number: Number(step.step_number ?? original.step_number ?? index + 1),
      instruction: step.instruction ?? original.instruction ?? ""
    };
  });

  const { error: deleteIngredientsError } = await supabase
    .from("ingredients")
    .delete()
    .eq("recipe_id", originalRecipe.id);
  if (deleteIngredientsError) {
    throw new Error(
      `Failed to replace ingredients for recipe ${originalRecipe.id}: ${deleteIngredientsError.message}`
    );
  }

  const { error: deleteStepsError } = await supabase
    .from("steps")
    .delete()
    .eq("recipe_id", originalRecipe.id);
  if (deleteStepsError) {
    throw new Error(`Failed to replace steps for recipe ${originalRecipe.id}: ${deleteStepsError.message}`);
  }

  if (translatedIngredients.length > 0) {
    const { error: ingredientsInsertError } = await supabase
      .from("ingredients")
      .insert(translatedIngredients);
    if (ingredientsInsertError) {
      throw new Error(
        `Failed to insert translated ingredients for recipe ${originalRecipe.id}: ${ingredientsInsertError.message}`
      );
    }
  }

  if (translatedSteps.length > 0) {
    const { error: stepsInsertError } = await supabase.from("steps").insert(translatedSteps);
    if (stepsInsertError) {
      throw new Error(
        `Failed to insert translated steps for recipe ${originalRecipe.id}: ${stepsInsertError.message}`
      );
    }
  }
}

(async () => {
  const recipes = await fetchFullRecipes();

  if (recipes.length === 0) {
    console.log("No recipes found.");
    return;
  }

  console.log(
    `Checking ${recipes.length} recipe(s)${USER_ID ? ` for user ${USER_ID}` : ""}${DRY_RUN ? " (dry run)" : ""}...`
  );

  const englishRecipes = [];
  let translatedCount = 0;
  let unchangedCount = 0;
  let failedCount = 0;

  for (const recipe of recipes) {
    try {
      if (!shouldReviewWithAI(recipe)) {
        unchangedCount += 1;
        console.log(`[skip] #${recipe.id} ${recipe.title} (heuristically Dutch)`);
        continue;
      }

      const normalized = await normalizeRecipeToDutch({
        title: recipe.title,
        description: recipe.description,
        servings: recipe.servings,
        calories_per_serving: recipe.calories_per_serving,
        protein_g: recipe.protein_g,
        carbs_g: recipe.carbs_g,
        fat_g: recipe.fat_g,
        meal_type: recipe.meal_type,
        dish_type: recipe.dish_type,
        prep_time: recipe.prep_time,
        cook_time: recipe.cook_time,
        source_url: recipe.source_url,
        ingredients: (recipe.ingredients ?? []).map((item) => ({
          name: item.name,
          amount: item.amount,
          unit: item.unit,
          store_section: item.store_section
        })),
        steps: (recipe.steps ?? []).map((step) => ({
          step_number: step.step_number,
          instruction: step.instruction
        }))
      });

      const detectedLanguage = normalized.detected_language;
      const englishSignals = englishSignalCount(recipe);
      const dutchSignals = dutchSignalCount(recipe);
      const shouldTranslate =
        detectedLanguage === "en" ||
        detectedLanguage === "mixed" ||
        (detectedLanguage === "other" && englishSignals > dutchSignals) ||
        (normalized.was_translated && englishSignals > 0);

      if (!shouldTranslate) {
        unchangedCount += 1;
        console.log(`[skip] #${recipe.id} ${recipe.title} (${detectedLanguage})`);
        continue;
      }

      englishRecipes.push({
        id: recipe.id,
        title: recipe.title,
        detected_language: detectedLanguage
      });

      if (!DRY_RUN) {
        await updateRecipeInDatabase(recipe, normalized.recipe);
      }

      translatedCount += 1;
      console.log(
        `${DRY_RUN ? "[would-translate]" : "[translated]"} #${recipe.id} ${recipe.title} -> ${normalized.recipe.title} (${detectedLanguage})`
      );
    } catch (error) {
      failedCount += 1;
      console.error(`[failed] #${recipe.id} ${recipe.title}: ${error.message || String(error)}`);
    }
  }

  console.log("\nEnglish or mixed recipes identified:");
  if (englishRecipes.length === 0) {
    console.log("- none");
  } else {
    for (const recipe of englishRecipes) {
      console.log(`- #${recipe.id} ${recipe.title} [${recipe.detected_language}]`);
    }
  }

  console.log(
    `\nSummary: total=${recipes.length}, translated=${translatedCount}, unchanged=${unchangedCount}, failed=${failedCount}, dryRun=${DRY_RUN}`
  );
})().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
