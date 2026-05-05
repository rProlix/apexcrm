// lib/product-360/validators.ts
// Server-side preset validation for the 360 Product Studio.
// Derives allowed values directly from the canonical presets constants so that
// adding a new preset to presets.ts is the only change required.

import {
  CAMERA_PRESETS,
  LIGHTING_PRESETS,
  BACKGROUND_PRESETS,
  CATEGORY_PRESETS,
  TURN_DIRECTION_OPTIONS,
} from './presets'
import type { CreatePackageOpts } from './packageService'

// ─── Allowed value sets (derived from the shared constants) ──────────────────

const VALID_CAMERA_PRESETS     = new Set(CAMERA_PRESETS.map(p => p.value))
const VALID_LIGHTING_PRESETS   = new Set(LIGHTING_PRESETS.map(p => p.value))
const VALID_BACKGROUND_PRESETS = new Set(BACKGROUND_PRESETS.map(p => p.value))
const VALID_CATEGORY_PRESETS   = new Set(CATEGORY_PRESETS.map(p => p.value))
const VALID_TURN_DIRECTIONS    = new Set(TURN_DIRECTION_OPTIONS.map(p => p.value))

// ─── Structured error type ────────────────────────────────────────────────────

export interface P360ValidationError {
  type:    'validation_error'
  field:   string
  title:   string
  message: string
  details?: string
}

export type P360ApiError =
  | P360ValidationError
  | { type: 'constraint_error'; field: string; title: string; message: string; details?: string }
  | { type: 'not_found';        title: string; message: string; details?: string }
  | { type: 'forbidden';        title: string; message: string }
  | { type: 'internal';         title: string; message: string; details?: string }

// ─── Individual field validators ─────────────────────────────────────────────

export function validateCameraPreset(value: string | null | undefined): P360ValidationError | null {
  if (!value) return null
  if (!VALID_CAMERA_PRESETS.has(value)) {
    return {
      type:    'validation_error',
      field:   'camera_preset',
      title:   'Invalid camera preset',
      message: `"${value}" is not a recognised camera preset. Please choose one of the available options.`,
    }
  }
  return null
}

export function validateLightingPreset(value: string | null | undefined): P360ValidationError | null {
  if (!value) return null
  if (!VALID_LIGHTING_PRESETS.has(value)) {
    return {
      type:    'validation_error',
      field:   'lighting_preset',
      title:   'Invalid lighting preset',
      message: `"${value}" is not a recognised lighting preset. Please choose one of the available options.`,
    }
  }
  return null
}

export function validateBackgroundPreset(value: string | null | undefined): P360ValidationError | null {
  if (!value) return null
  if (!VALID_BACKGROUND_PRESETS.has(value)) {
    return {
      type:    'validation_error',
      field:   'background_preset',
      title:   'Invalid background preset',
      message: `"${value}" is not a recognised background preset. Please choose one of the available options.`,
    }
  }
  return null
}

export function validateCategoryPreset(value: string | null | undefined): P360ValidationError | null {
  if (!value) return null
  if (!VALID_CATEGORY_PRESETS.has(value)) {
    return {
      type:    'validation_error',
      field:   'category_preset',
      title:   'Invalid product category',
      message: `"${value}" is not a recognised product category. Please choose one of the available options.`,
    }
  }
  return null
}

export function validateTurnDirection(value: string | null | undefined): P360ValidationError | null {
  if (!value) return null
  if (!VALID_TURN_DIRECTIONS.has(value)) {
    return {
      type:    'validation_error',
      field:   'turn_direction',
      title:   'Invalid turn direction',
      message: `Turn direction must be "clockwise" or "counter_clockwise".`,
    }
  }
  return null
}

// ─── Full create-package input validation ─────────────────────────────────────

export interface NormalizedCreatePackageInput extends CreatePackageOpts {
  name: string
}

export function normalizeCreatePackageInput(
  raw: CreatePackageOpts,
): { ok: true; data: NormalizedCreatePackageInput } | { ok: false; error: P360ValidationError } {
  const name = raw.name?.trim() ?? ''
  if (!name) {
    return {
      ok: false,
      error: {
        type:    'validation_error',
        field:   'name',
        title:   'Package name required',
        message: 'Please provide a package name.',
      },
    }
  }

  if (!raw.tenantId?.trim()) {
    return {
      ok: false,
      error: {
        type:    'validation_error',
        field:   'tenantId',
        title:   'Tenant required',
        message: 'Could not determine the active tenant.',
      },
    }
  }

  if (!raw.productId?.trim()) {
    return {
      ok: false,
      error: {
        type:    'validation_error',
        field:   'productId',
        title:   'Product required',
        message: 'Please select a product.',
      },
    }
  }

  for (const err of [
    validateCameraPreset(raw.cameraPreset),
    validateLightingPreset(raw.lightingPreset),
    validateBackgroundPreset(raw.backgroundPreset),
    validateCategoryPreset(raw.categoryPreset),
    validateTurnDirection(raw.turnDirection),
  ]) {
    if (err) return { ok: false, error: err }
  }

  return {
    ok:   true,
    data: {
      ...raw,
      name,
      // Normalise optional string fields
      description:       raw.description?.trim()       || undefined,
      generationPrompt:  raw.generationPrompt?.trim()  || undefined,
      generationNotes:   raw.generationNotes?.trim()   || undefined,
      negativePrompt:    raw.negativePrompt?.trim()     || undefined,
    },
  }
}

// ─── Map raw DB / runtime errors to structured API errors ────────────────────

export function mapDbErrorToApiError(message: string): P360ApiError {
  const m = message.toLowerCase()

  if (m.includes('p360_pkg_camera_preset_check')) {
    return {
      type:    'constraint_error',
      field:   'camera_preset',
      title:   'Invalid camera preset',
      message: 'The selected camera preset is not recognised by the database. Please choose a valid option.',
      details: message,
    }
  }
  if (m.includes('p360_pkg_lighting_preset_check')) {
    return {
      type:    'constraint_error',
      field:   'lighting_preset',
      title:   'Invalid lighting preset',
      message: 'The selected lighting preset is not recognised. Please choose a valid option.',
      details: message,
    }
  }
  if (m.includes('p360_pkg_background_preset_check')) {
    return {
      type:    'constraint_error',
      field:   'background_preset',
      title:   'Invalid background preset',
      message: 'The selected background preset is not recognised. Please choose a valid option.',
      details: message,
    }
  }
  if (m.includes('p360_pkg_category_preset_check')) {
    return {
      type:    'constraint_error',
      field:   'category_preset',
      title:   'Invalid product category',
      message: 'The selected product category is not recognised. Please choose a valid option.',
      details: message,
    }
  }
  if (m.includes('p360_pkg_turn_direction_check')) {
    return {
      type:    'constraint_error',
      field:   'turn_direction',
      title:   'Invalid turn direction',
      message: 'Turn direction must be "clockwise" or "counter_clockwise".',
      details: message,
    }
  }
  if (m.includes('violates foreign key') && m.includes('product_id')) {
    return {
      type:    'not_found',
      title:   'Product not found',
      message: 'The selected product does not exist or does not belong to your account.',
      details: message,
    }
  }
  if (m.includes('violates foreign key') && m.includes('tenant_id')) {
    return {
      type:    'forbidden',
      title:   'Tenant mismatch',
      message: 'The package could not be created due to a tenant ownership issue.',
    }
  }
  if (m.includes('null value') || m.includes('not-null')) {
    return {
      type:    'constraint_error',
      field:   'unknown',
      title:   'Missing required field',
      message: 'One or more required fields are missing. Please fill in all required fields.',
      details: message,
    }
  }
  if (m.includes('unique constraint') || m.includes('duplicate key')) {
    return {
      type:    'constraint_error',
      field:   'name',
      title:   'Duplicate package',
      message: 'A package with this name already exists. Please use a different name.',
      details: message,
    }
  }

  return {
    type:    'internal',
    title:   'Package creation failed',
    message: 'An unexpected error occurred while creating the package. Please try again.',
    details: message,
  }
}
