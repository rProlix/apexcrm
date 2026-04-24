/**
 * One-time database schema setup script.
 * Reads DATABASE_URL from .env.local and applies the initial migration.
 *
 * Usage:
 *   node scripts/setup-db.mjs
 *
 * Requires DATABASE_URL in .env.local:
 *   DATABASE_URL=postgresql://postgres.PROJECT_REF:DB_PASSWORD@aws-0-us-west-1.pooler.supabase.com:6543/postgres
 *
 * Get your DB password + connection string from:
 *   Supabase Dashboard → Project Settings → Database → Connection string → Transaction mode
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const { Client } = pg

// ── Load env ──────────────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url))
const root  = join(__dir, '..')
const envPath = join(root, '.env.local')

let envContent
try {
  envContent = readFileSync(envPath, 'utf-8')
} catch {
  console.error('❌  Could not read .env.local')
  process.exit(1)
}

const match = envContent.match(/^DATABASE_URL=(.+)$/m)
const dbUrl = match?.[1]?.trim()

if (!dbUrl) {
  console.error(`
❌  DATABASE_URL is not set in .env.local

Add it like this (replace YOUR_DB_PASSWORD):

  DATABASE_URL=postgresql://postgres.sninslouurwlxopuhkhs:YOUR_DB_PASSWORD@aws-0-us-west-1.pooler.supabase.com:6543/postgres

Get your password from:
  https://supabase.com/dashboard/project/sninslouurwlxopuhkhs/settings/database
  → "Database password" section or "Connection string" (Transaction mode)
`)
  process.exit(1)
}

// ── Read migration SQL ─────────────────────────────────────
const sqlPath = join(root, 'supabase/migrations/20260415000000_initial_schema.sql')
let sql
try {
  sql = readFileSync(sqlPath, 'utf-8')
} catch {
  console.error('❌  Migration file not found at', sqlPath)
  process.exit(1)
}

// ── Connect and run ────────────────────────────────────────
console.log('🔗  Connecting to database...')
const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()
  console.log('✅  Connected')

  console.log('🚀  Running initial schema migration...')
  await client.query(sql)

  console.log('✅  Schema created successfully!')
  console.log('\nYour database is ready. Start the dev server with:\n  npm run dev\n')
} catch (err) {
  console.error('❌  Migration failed:', err.message)
  process.exit(1)
} finally {
  await client.end()
}
