## AI Recipe Manager

Personal recipe database with AI-powered recipe extraction and categorization.

### Tech stack
dfd
- **Frontend**: Next.js (App Router) + React + TailwindCSS
- **Backend**: Next.js API routes (Node.js)
- **Auth & database**: Firebase Auth + Cloud Firestore
- **Hosting**: Firebase App Hosting
- **AI**: Google Gemini API for recipe extraction dsafa
- **Scraping**: Cheerio for HTML parsing

### Environment variables

Create a `.env.local` file based on `.env.example`:
asdfasdf
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

### Shopping list persistence

- Shopping lists are stored per Firebase Auth account in Firestore (`shoppingLists/{uid}`), without automatic expiry or weekly resets.
- Sign in with the same account on each device. The shopping list refreshes every 10 seconds while visible and when returning to the page.
- Adds, edits, checks and deletions are applied to the latest saved list in a Firestore transaction, rather than replacing it with an outdated browser copy.
- The first browser opening or modifying the list imports its existing local list if the account has no saved list yet. Open the browser containing the list you want to keep first. Once an account list exists, other browsers' old local copies are ignored to prevent deleted items from returning.
- Clearing the list keeps an empty account record; items are only removed by explicit user actions. Offline or failed saves show an error and are not reported as successful.
- The saved-list API verifies Firebase ID tokens and uses the Admin SDK. It does not require changing the client Firestore rules.

Run the shopping list regression tests with `npm run test:shopping-list`. They cover cross-device operations, legacy item keys, account isolation and preventing an old browser list from restoring deleted items. API tests use a mocked database; also verify synchronization with two browsers signed into the same account after deployment.
