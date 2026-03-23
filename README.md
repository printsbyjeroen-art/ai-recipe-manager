## AI Recipe Manager

Personal recipe database with AI-powered recipe extraction and categorization.

### Tech stack

- **Frontend**: Next.js (App Router) + React + TailwindCSS  
- **Backend**: Next.js API routes (Node.js)  
- **Database**: Supabase (PostgreSQL)  
- **AI**: Google Gemini API for recipe extraction  
- **Scraping**: Cheerio for HTML parsing

### Environment variables

Create a `.env.local` file based on `.env.example`:

```bash
cp .env.example .env.local
```

Fill in:

- `NEXT_PUBLIC_SUPABASE_URL` – your Supabase project URL  
- `SUPABASE_SERVICE_ROLE_KEY` – **service role** key (server-side only)  
- `GOOGLE_API_KEY` – Google Gemini API key

### Database schema (Supabase)

Run the SQL in `supabase-schema.sql` inside your Supabase SQL editor to create:

- `recipes` – recipe metadata  
- `ingredients` – ingredients linked by `recipe_id`  
- `steps` – step-by-step instructions linked by `recipe_id`

### Install & run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

### Main pages

- **Dashboard** (`/`) – list, search, and filter recipes  
- **Import Recipe** (`/import`) – paste a URL, preview extracted recipe, save  
- **Recipe Page** (`/recipes/:id`) – details, scaled ingredients, steps  
- **Cooking Mode** (`/recipes/:id/cook`) – mobile-friendly, large text, checklists

### AI extraction prompt

The Gemini prompt used for extraction lives in:

- `lib/gemini.ts` as `RECIPE_EXTRACTION_PROMPT`

The import flow:

1. User submits a URL on `/import`.  
2. `/api/import-recipe` fetches the page, strips HTML with Cheerio.  
3. Page text + URL is sent to Gemini with the extraction prompt.  
4. The model returns a JSON matching the standard recipe format.  
5. User previews and saves the recipe to the database via `/api/recipes`.

