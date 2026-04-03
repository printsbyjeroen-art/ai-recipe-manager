export const STORE_SECTIONS = [
  "produce",
  "bakery",
  "dairy",
  "meat",
  "fish",
  "frozen",
  "pantry",
  "spices",
  "drinks",
  "snacks",
  "household",
  "miscellaneous"
] as const;

export type StoreSection = (typeof STORE_SECTIONS)[number];

export type NormalizedUnit = {
  unit: string;
  multiplier: number;
};

const STORE_SECTION_LABELS: Record<StoreSection, string> = {
  produce: "Produce",
  bakery: "Bakery",
  dairy: "Dairy",
  meat: "Meat",
  fish: "Fish",
  frozen: "Frozen",
  pantry: "Pantry",
  spices: "Spices",
  drinks: "Drinks",
  snacks: "Snacks",
  household: "Household",
  miscellaneous: "Miscellaneous"
};

const SECTION_ALIASES: Record<string, StoreSection> = {
  groenten: "produce",
  groente: "produce",
  fruit: "produce",
  groentefruit: "produce",
  brood: "bakery",
  broodbeleg: "bakery",
  zuivel: "dairy",
  koelkast: "dairy",
  vlees: "meat",
  vis: "fish",
  diepvries: "frozen",
  vriezer: "frozen",
  voorraadkast: "pantry",
  pantry: "pantry",
  kruiden: "spices",
  specerijen: "spices",
  drinken: "drinks",
  beverages: "drinks",
  huishouden: "household",
  household: "household",
  overig: "miscellaneous",
  misc: "miscellaneous"
};

const INGREDIENT_TOKEN_ALIASES: Record<string, string> = {
  tomatoes: "tomato",
  tomaatjes: "tomaat",
  uien: "ui",
  eieren: "ei",
  paprikas: "paprika",
  wortels: "wortel",
  citroenen: "citroen",
  limoenen: "limoen",
  teentjes: "teen",
  cloves: "clove",
  onions: "onion"
};

const SECTION_KEYWORDS: Record<StoreSection, string[]> = {
  produce: [
    "tomaat",
    "tomato",
    "ui",
    "onion",
    "paprika",
    "carrot",
    "wortel",
    "courgette",
    "zucchini",
    "spinazie",
    "spinach",
    "sla",
    "lettuce",
    "komkommer",
    "cucumber",
    "avocado",
    "citroen",
    "lemon",
    "limoen",
    "lime",
    "appel",
    "apple",
    "banaan",
    "banana",
    "knoflook",
    "garlic",
    "gember",
    "ginger",
    "champignon",
    "mushroom"
  ],
  bakery: ["brood", "bread", "bagel", "wrap", "wraps", "tortilla", "bun", "broodje", "pita"],
  dairy: ["melk", "milk", "yoghurt", "yogurt", "kaas", "cheese", "boter", "butter", "cream", "room", "ei", "egg"],
  meat: ["kip", "chicken", "gehakt", "beef", "rund", "pork", "varken", "bacon", "ham", "worst", "turkey"],
  fish: ["salm", "zalm", "tonijn", "tuna", "shrimp", "garnaal", "vis", "fish"],
  frozen: ["frozen", "diepvries", "ijs", "ice cream"],
  pantry: ["rijst", "rice", "pasta", "noodle", "noodles", "olie", "oil", "azijn", "vinegar", "flour", "meel", "beans", "bonen", "lentils", "linzen", "blik", "can", "tomatenpuree", "stock", "bouillon"],
  spices: ["zout", "salt", "peper", "pepper", "paprikapoeder", "oregano", "basil", "kerrie", "curry", "komijn", "cumin", "kruiden", "spice"],
  drinks: ["water", "juice", "sap", "cola", "wijn", "wine", "bier", "beer", "coffee", "koffie", "tea", "thee"],
  snacks: ["chips", "cookie", "koek", "chocolate", "chocolade", "nuts", "noten"],
  household: ["zeep", "soap", "detergent", "wasmiddel", "toiletpapier", "trash bag", "vuilniszak", "batterij", "battery", "shampoo"],
  miscellaneous: []
};

export const UNIT_ALIASES: Record<string, NormalizedUnit> = {
  g: { unit: "g", multiplier: 1 },
  gr: { unit: "g", multiplier: 1 },
  gram: { unit: "g", multiplier: 1 },
  grams: { unit: "g", multiplier: 1 },
  kg: { unit: "g", multiplier: 1000 },
  kilo: { unit: "g", multiplier: 1000 },
  kilogram: { unit: "g", multiplier: 1000 },
  kilograms: { unit: "g", multiplier: 1000 },
  ml: { unit: "ml", multiplier: 1 },
  milliliter: { unit: "ml", multiplier: 1 },
  milliliters: { unit: "ml", multiplier: 1 },
  l: { unit: "ml", multiplier: 1000 },
  liter: { unit: "ml", multiplier: 1000 },
  liters: { unit: "ml", multiplier: 1000 },
  el: { unit: "el", multiplier: 1 },
  eetlepel: { unit: "el", multiplier: 1 },
  eetlepels: { unit: "el", multiplier: 1 },
  tablespoon: { unit: "el", multiplier: 1 },
  tablespoons: { unit: "el", multiplier: 1 },
  tbsp: { unit: "el", multiplier: 1 },
  tl: { unit: "tl", multiplier: 1 },
  theelepel: { unit: "tl", multiplier: 1 },
  theelepels: { unit: "tl", multiplier: 1 },
  teaspoon: { unit: "tl", multiplier: 1 },
  teaspoons: { unit: "tl", multiplier: 1 },
  tsp: { unit: "tl", multiplier: 1 },
  stuk: { unit: "st", multiplier: 1 },
  stuks: { unit: "st", multiplier: 1 },
  piece: { unit: "st", multiplier: 1 },
  pieces: { unit: "st", multiplier: 1 },
  teen: { unit: "teen", multiplier: 1 },
  tenen: { unit: "teen", multiplier: 1 },
  clove: { unit: "teen", multiplier: 1 },
  cloves: { unit: "teen", multiplier: 1 },
  blik: { unit: "blik", multiplier: 1 },
  blikken: { unit: "blik", multiplier: 1 },
  can: { unit: "blik", multiplier: 1 },
  cans: { unit: "blik", multiplier: 1 },
  bos: { unit: "bos", multiplier: 1 },
  bossen: { unit: "bos", multiplier: 1 },
  bunch: { unit: "bos", multiplier: 1 },
  bunches: { unit: "bos", multiplier: 1 },
  snuf: { unit: "snuf", multiplier: 1 },
  snufje: { unit: "snuf", multiplier: 1 },
  pinch: { unit: "snuf", multiplier: 1 },
  pinches: { unit: "snuf", multiplier: 1 }
};

export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[,/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function singularizeToken(token: string) {
  if (INGREDIENT_TOKEN_ALIASES[token]) {
    return INGREDIENT_TOKEN_ALIASES[token];
  }

  if (token.length > 4 && token.endsWith("en")) {
    return token.slice(0, -2);
  }

  if (token.length > 4 && token.endsWith("s") && !token.endsWith("is") && !token.endsWith("us")) {
    return token.slice(0, -1);
  }

  return token;
}

export function normalizeIngredientName(name: string) {
  return normalizeText(name)
    .split(" ")
    .filter(Boolean)
    .map(singularizeToken)
    .join(" ");
}

export function normalizeStoreSection(value?: string | null): StoreSection {
  const normalized = normalizeText(value || "");
  if ((STORE_SECTIONS as readonly string[]).includes(normalized)) {
    return normalized as StoreSection;
  }
  return SECTION_ALIASES[normalized] ?? "miscellaneous";
}

export function displayStoreSection(value?: string | null) {
  return STORE_SECTION_LABELS[normalizeStoreSection(value)];
}

export function normalizeUnit(unit: string): NormalizedUnit {
  const normalized = normalizeText(unit);
  return UNIT_ALIASES[normalized] ?? { unit: normalized, multiplier: 1 };
}

export function guessStoreSection(name: string): StoreSection {
  const normalized = normalizeIngredientName(name);

  for (const [section, keywords] of Object.entries(SECTION_KEYWORDS) as Array<[StoreSection, string[]]>) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return section;
    }
  }

  return "miscellaneous";
}
