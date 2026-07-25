import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()

test('Supabase project configuration includes its declared seed and ignores local state', async () => {
  const [config, ignore, seed] = await Promise.all([
    readFile(path.join(ROOT, 'supabase/config.toml'), 'utf8'),
    readFile(path.join(ROOT, 'supabase/.gitignore'), 'utf8'),
    readFile(path.join(ROOT, 'supabase/seed.sql'), 'utf8'),
  ])

  assert.match(config, /^project_id = "apexcrm"$/m)
  assert.match(config, /\[db\.migrations\][\s\S]*enabled = true/)
  assert.match(config, /\[db\.seed\][\s\S]*enabled = true/)
  assert.match(config, /sql_paths = \["\.\/seed\.sql"\]/)
  assert.match(
    config,
    /additional_redirect_urls = \["http:\/\/127\.0\.0\.1:3000", "http:\/\/localhost:3000"\]/
  )
  assert.match(ignore, /^\.temp$/m)
  assert.match(ignore, /^\.branches$/m)
  assert.match(seed, /select 1;/)

  await access(path.join(ROOT, 'supabase/seed.sql'))
})

test('Supabase repository configuration contains no literal credentials', async () => {
  const config = await readFile(path.join(ROOT, 'supabase/config.toml'), 'utf8')

  assert.doesNotMatch(config, /eyJ[a-zA-Z0-9_-]{20,}/)
  assert.doesNotMatch(config, /sb_(?:secret|publishable)_[a-zA-Z0-9_-]+/)
  assert.doesNotMatch(config, /service_role\s*=/)
  assert.match(config, /openai_api_key = "env\(OPENAI_API_KEY\)"/)
  assert.match(config, /s3_secret_key = "env\(S3_SECRET_KEY\)"/)
})

test('README uses the supported Supabase migration and seed command', async () => {
  const readme = await readFile(path.join(ROOT, 'README.md'), 'utf8')

  assert.match(readme, /supabase migration list --linked/)
  assert.match(readme, /supabase db push --include-seed/)
  assert.doesNotMatch(readme, /supabase db execute/)
  assert.match(readme, /Do not use `--include-all`/)
})
