import type { ModuleKey } from '@/modules/shared/moduleTypes'

export interface ModulePackageInput {
  id?: string | null
  name: string
  slug: string
  description: string
  benefits: string[]
  moduleKeys: ModuleKey[]
}

export interface ModulePackageValidation {
  ok: boolean
  value?: ModulePackageInput
  error?: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function slugifyPackageName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function validateModulePackageInput(
  raw: unknown,
  allowedModuleKeys: readonly ModuleKey[]
): ModulePackageValidation {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Package details are required.' }
  }

  const input = raw as Record<string, unknown>
  const id = input.id == null || input.id === '' ? null : String(input.id)
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const requestedSlug =
    typeof input.slug === 'string' && input.slug.trim()
      ? input.slug.trim().toLowerCase()
      : slugifyPackageName(name)
  const description = typeof input.description === 'string' ? input.description.trim() : ''

  if (id && !UUID_PATTERN.test(id)) return { ok: false, error: 'Package ID is invalid.' }
  if (name.length < 2 || name.length > 80) {
    return { ok: false, error: 'Package name must be between 2 and 80 characters.' }
  }
  if (!SLUG_PATTERN.test(requestedSlug)) {
    return { ok: false, error: 'Package slug may contain lowercase letters, numbers, and hyphens.' }
  }
  if (description.length > 500) {
    return { ok: false, error: 'Package description cannot exceed 500 characters.' }
  }

  const allowed = new Set<string>(allowedModuleKeys)
  const moduleKeys = Array.isArray(input.moduleKeys)
    ? Array.from(
        new Set(
          input.moduleKeys.filter(
            (key): key is ModuleKey => typeof key === 'string' && allowed.has(key)
          )
        )
      )
    : []
  if (moduleKeys.length === 0) {
    return { ok: false, error: 'Choose at least one module for this package.' }
  }

  const benefits = Array.isArray(input.benefits)
    ? Array.from(
        new Set(
          input.benefits
            .filter((benefit): benefit is string => typeof benefit === 'string')
            .map((benefit) => benefit.trim())
            .filter(Boolean)
        )
      ).slice(0, 20)
    : []
  if (benefits.some((benefit) => benefit.length > 80)) {
    return { ok: false, error: 'Each package benefit must be 80 characters or fewer.' }
  }

  return {
    ok: true,
    value: {
      id,
      name,
      slug: requestedSlug,
      description,
      benefits,
      moduleKeys,
    },
  }
}

export function moduleStateAfterPackage(
  allModuleKeys: readonly ModuleKey[],
  packagedModuleKeys: readonly ModuleKey[]
): Record<ModuleKey, boolean> {
  const enabled = new Set(packagedModuleKeys)
  return Object.fromEntries(
    allModuleKeys.map((moduleKey) => [moduleKey, enabled.has(moduleKey)])
  ) as Record<ModuleKey, boolean>
}
