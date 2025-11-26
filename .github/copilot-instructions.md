## Purpose
Help an AI coding assistant be productive quickly in this repository by documenting the architecture, developer workflows, conventions and useful file examples.

## Big-picture architecture (what to know first)
- This repo contains three independent apps that collaborate:
  - `admin-api/` — TypeScript Express API that implements iFood catalog endpoints (see `admin-api/src/routes/*`). Run with `npm run dev` or build with `npm run build` (tsc).
  - `admin-ui/` — React + TypeScript admin interface that calls the admin API (see `admin-ui/src/services/api.ts` and `src/pages/*`). Run with `npm start` (webpack dev server).
  - `functions/` — Firebase Cloud Functions (TypeScript source in `functions/src`, compiled JS in `functions/lib`) that host webhooks and background services (WhatsApp, OpenAI, Twilio, Firebase Admin).

## Key workflows & commands
- Backend (admin-api):
  - Install: `cd admin-api && npm install`
  - Dev: `npm run dev` (uses `ts-node` to run `src/index.ts`)
  - Build: `npm run build` (runs `tsc`) and `npm start` runs `dist/index.js`.
- Frontend (admin-ui):
  - Install & run: `cd admin-ui && npm install && npm start` (webpack dev server)
  - Build: `npm run build` (webpack production)
- Functions (webhook):
  - Install: `cd functions && npm install`
  - Serve locally: `npm run serve` — this runs `npm run build` (tsc) then `firebase emulators:start` (emulator ports configured in `firebase.json`, functions emulator on 5001)
  - Deploy: `npm run deploy` (build + `firebase deploy --only functions`)

## Environment & credentials
- The admin API expects `IFOOD_ACCESS_TOKEN` in `.env`. Use `cp .env.example .env` in `admin-api/` and `admin-ui/` then edit values.
- Token troubleshooting notes are in `functions/README-TOKEN.md` (expired iFood tokens are a common issue).

## Conventions & patterns to follow (concrete examples)
- Services & controllers: both `admin-api` and `functions` use a services/ controllers/ routes/ separation. Example: `admin-api/src/routes/items.ts` calls `services/ifood/*`.
- Typescript typings: interfaces live in `*/src/types/IFood.ts` (admin-api and admin-ui share the same domain types).
- Build artifact layout:
  - `functions/src/` — TypeScript source
  - `functions/lib/` — compiled JavaScript that the runtime uses (commit/CI may include compiled code)
- UUID generation and price/status patch endpoints are common patterns — see `admin-api` README examples for request bodies for `PUT /merchants/{merchantId}/items`.

## Integration points & external dependencies
- iFood: admin-api integrates with iFood endpoints. See `admin-api/README.md` for required request shapes and endpoints.
- Firebase: `functions` uses `firebase-admin`, `firebase-functions` and local emulators. Emulator config lives in `firebase.json` (functions port 5001).
- Third-party APIs used in functions: OpenAI (`openai`), Twilio (`twilio`), Google Cloud libs (`@google-cloud/*`). When modifying message flows, check `functions/src/services/*` and `functions/lib/controllers/*`.

## Debugging tips
- To test webhook and runtime behavior locally: run `cd functions && npm run serve` and inspect emulator logs. Functions run under Node 22 (see `package.json` engines).
- Use console logs or `winston` logger (used throughout) for structured logs.

## Files to inspect for examples
- Request/response examples: `admin-api/README.md` (catalog/item JSON bodies)
- UI-to-backend wiring: `admin-ui/src/services/api.ts` and `admin-ui/src/pages/CreateItem.tsx`
- Webhook flow and message handling: `functions/src/services/incomingMessageService.ts` and `functions/lib/controllers/processOrderAlert.js`

## What NOT to change without care
- The `functions` build output (`functions/lib`) is deployed to Firebase. If you modify TypeScript sources, build before running emulators or deploying.
- Do not rotate or publish any private keys or secrets found under `functions/secrets/` or `*.json` in repo; update local `.env` instead.

If anything above is unclear or you want more targeted examples (unit tests, example requests for an endpoint, or a quick local run script), tell me which part to expand and I will iterate.
