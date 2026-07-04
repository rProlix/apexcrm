# ApexCRM

Multi-tenant white-labeled SaaS CRM platform built with Next.js 14, TypeScript, Tailwind, and Supabase.

## Local Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file and fill in your Supabase credentials
cp .env.example .env.local

# 3. Apply Supabase migrations
npx supabase db push

# 4. Seed the database
npx supabase db execute --file supabase/seed.sql

# 5. Start dev server
npm run dev
```

App runs at `http://localhost:3000`.

## Van Damage AI (Phase 2)

The Slack/SQS/S3/Gemini foundation and standalone worker source are documented in [`docs/van-damage-ai-phase2.md`](docs/van-damage-ai-phase2.md). Phase 2 does not deploy anything to EC2.

For subdomain-based tenant routing locally, add entries to `/etc/hosts`:

```
127.0.0.1 rentalco.localhost
127.0.0.1 plumberpro.localhost
127.0.0.1 salonx.localhost
```

Then visit `http://rentalco.localhost:3000`.

## Scripts

| Command        | Description              |
|----------------|--------------------------|
| `npm run dev`  | Start dev server         |
| `npm run build`| Production build         |
| `npm run start`| Start production server  |
| `npm run lint` | Run ESLint               |
| `npm run format`| Format with Prettier    |

## 360 Product Studio — Required Environment Variables

### Gemini / Imagen (default provider)

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google Gemini API key. Used for both text planning and Imagen image generation. |
| `GOOGLE_API_KEY` | Alt | Alternative to `GEMINI_API_KEY` (same key). |
| `P360_IMAGEN_MODEL` | No | Imagen model name (default: `imagen-3.0-generate-001`). |
| `P360_PLANNER_MODEL` | No | Gemini text model for scene contract planning (default: `gemini-2.0-flash-001`). |
| `P360_VISION_MODEL` | No | Gemini vision model for frame consistency validation. |
| `GEMINI_360_MODEL` | No | Gemini model for legacy text generation paths. |
| `P360_CONSISTENCY_THRESHOLD` | No | Consistency score threshold 0–100 (default: 70). |
| `P360_FRAME_MAX_RETRIES` | No | Max retries per frame on drift detection (default: 2). |

### Leonardo AI provider (Blueprint Executions)

| Variable | Required | Description |
|---|---|---|
| `LEONARDO_API_KEY` | Yes (for Leonardo) | Leonardo AI API key. Server-side only. Never expose to browser. |
| `LEONARDO_360_BLUEPRINT_VERSION_ID` | Yes (for Leonardo) | Blueprint version UUID from Leonardo web app. |
| `LEONARDO_360_REFERENCE_IMAGE_NODE_ID` | Yes (for Leonardo) | Node ID for the imageUrl input in your blueprint. |
| `LEONARDO_360_TEXT_VARIABLES_NODE_ID` | Yes (for Leonardo) | Node ID for the textVariables input in your blueprint. |

### Client-side defaults

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_360_DEFAULT_PROVIDER` | No | Default AI provider shown in create modal (`gemini` or `leonardo`). Default: `gemini`. |

### Storage & generation limits

| Variable | Required | Description |
|---|---|---|
| `MAX_360_FRAMES_PER_PACKAGE` | No | Hard cap on frames per package (default: 24). |
| `DEFAULT_360_FRAMES_PER_PACKAGE` | No | Default frame count when not specified (default: 36). |
| `IMAGE_GENERATION_DELAY_MS` | No | Delay between frames in ms to avoid quota spikes (default: 0). |

### Example `.env.local` for 360 Product Studio

```env
# Gemini / Imagen
GEMINI_API_KEY=your_gemini_api_key_here
P360_IMAGEN_MODEL=imagen-3.0-generate-001
P360_PLANNER_MODEL=gemini-2.0-flash-001

# Leonardo AI (Blueprint Executions)
LEONARDO_API_KEY=your_leonardo_api_key_here
LEONARDO_360_BLUEPRINT_VERSION_ID=37aad09f-eab5-4b84-871f-2b81d5e41327
LEONARDO_360_REFERENCE_IMAGE_NODE_ID=7f3a1b2c-4d5e-4f6a-8b9c-0d1e2f3a4b5c
LEONARDO_360_TEXT_VARIABLES_NODE_ID=8e4b2c3d-5f6a-4b7c-9d0e-1f2a3b4c5d6e

# Default provider in the UI
NEXT_PUBLIC_360_DEFAULT_PROVIDER=gemini
```
