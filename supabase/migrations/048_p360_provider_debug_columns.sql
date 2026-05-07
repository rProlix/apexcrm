-- Migration 048: P360 provider debug columns
--
-- Adds columns for storing sanitized provider debug info on packages and frames.
-- Used to surface request/response diagnostics in the UI without exposing secrets.
--
-- Idempotent (IF NOT EXISTS / DO$$ throughout).

BEGIN;

-- ── product_360_packages ─────────────────────────────────────────────────────

ALTER TABLE public.product_360_packages
  ADD COLUMN IF NOT EXISTS last_provider_debug       jsonb    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_provider_status_code integer  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_provider_stage        text     DEFAULT NULL;

-- ── product_360_frames ───────────────────────────────────────────────────────
-- migration 047 added provider_error_message and provider_error_details.
-- This migration adds raw_debug and status_code for deeper diagnostics.

ALTER TABLE public.product_360_frames
  ADD COLUMN IF NOT EXISTS provider_raw_debug      jsonb   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS provider_status_code    integer DEFAULT NULL;

COMMENT ON COLUMN public.product_360_packages.last_provider_debug IS
  'Sanitized debug object from the last provider response (no secrets)';
COMMENT ON COLUMN public.product_360_packages.last_provider_status_code IS
  'HTTP status code from the last provider API call';
COMMENT ON COLUMN public.product_360_packages.last_provider_stage IS
  'Stage at which the last provider interaction occurred (create-execution, poll, etc.)';

COMMENT ON COLUMN public.product_360_frames.provider_raw_debug IS
  'Sanitized per-frame provider debug (no secrets)';
COMMENT ON COLUMN public.product_360_frames.provider_status_code IS
  'HTTP status code from the provider call that generated this frame';

COMMIT;
