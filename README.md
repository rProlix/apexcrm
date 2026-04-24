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
