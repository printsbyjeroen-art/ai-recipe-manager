## AI Recipe Manager

Personal recipe database with AI-powered recipe extraction and categorization.

### Tech stack

- **Frontend**: Next.js (App Router) + React + TailwindCSS
- **Backend**: Next.js API routes (Node.js)
- **Auth & database**: Firebase Auth + Cloud Firestore
- **Hosting**: Firebase App Hosting
- **AI**: Google Gemini API for recipe extraction dsafa
- **Scraping**: Cheerio for HTML parsing

### Environment variables

Create a `.env.local` file based on `.env.example`:

```bash
copy .env.example .env.local
```

Fill in:

- `NEXT_PUBLIC_FIREBASE_API_KEY` – Firebase web API key
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` – e.g. `recepten-a8dfe.firebaseapp.com`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID` – `recepten-a8dfe`
- `NEXT_PUBLIC_FIREBASE_APP_ID` – Firebase web app ID
- `GOOGLE_API_KEY` – Google Gemini API key
- `FIREBASE_SERVICE_ACCOUNT_KEY` – service account JSON as a single line (local admin SDK only)

### Install & run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.
