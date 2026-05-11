// lib/appointments/types.ts

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'canceled'
  | 'no_show'
  | 'rescheduled'

export type RepeatType = 'daily' | 'weekly' | 'custom'

export type AppointmentBlockType = 'available' | 'unavailable' | 'blackout'

// ── Professional / Employee ───────────────────────────────────────────────────

export interface Professional {
  id:         string
  tenant_id:  string
  name:       string
  email:      string | null
  phone:      string | null
  role:       string
  avatar_url: string | null
  is_active:  boolean
  created_at: string
  updated_at: string
}

// ── Appointment Availability Block ────────────────────────────────────────────

export interface AppointmentAvailabilityBlock {
  id:                    string
  tenant_id:             string
  staff_id:              string | null
  title:                 string | null
  description:           string | null
  block_type:            AppointmentBlockType
  day_of_week:           number | null    // 0=Sun … 6=Sat (recurring)
  start_time:            string | null    // "HH:MM" (recurring)
  end_time:              string | null    // "HH:MM" (recurring)
  starts_at:             string | null    // ISO (one-time)
  ends_at:               string | null    // ISO (one-time)
  timezone:              string
  slot_duration_minutes: number
  buffer_before_minutes: number
  buffer_after_minutes:  number
  max_bookings_per_slot: number
  is_recurring:          boolean
  is_active:             boolean
  recurrence_rule:       string | null
  created_by:            string | null
  created_at:            string
  updated_at:            string
  // Joined
  professional?: Pick<Professional, 'id' | 'name' | 'avatar_url'> | null
}

// ── Appointment Service ───────────────────────────────────────────────────────

export interface AppointmentServiceRecord {
  id:               string
  tenant_id:        string
  name:             string
  description:      string | null
  duration_minutes: number
  price_cents:      number | null
  is_active:        boolean
  created_at:       string
  updated_at:       string
}

// ── Available Slot ────────────────────────────────────────────────────────────

export interface AvailableSlot {
  starts_at:  string  // ISO 8601
  ends_at:    string  // ISO 8601
  staff_id:   string | null
  staff_name: string | null
  block_id:   string | null
  available:  boolean
}

// ── Appointment ───────────────────────────────────────────────────────────────

export interface Appointment {
  id:                   string
  tenant_id:            string
  customer_id:          string | null
  staff_id:             string | null
  appointment_block_id: string | null
  title:                string
  description:          string | null
  status:               AppointmentStatus
  starts_at:            string  // ISO 8601 timestamp
  ends_at:              string  // ISO 8601 timestamp
  location:             string | null
  notes:                string | null
  timezone:             string
  created_by:           string | null
  created_at:           string
  updated_at:           string
  // Joined fields (optional)
  customer?:      { id: string; name: string; email: string | null } | null
  professional?:  Pick<Professional, 'id' | 'name' | 'avatar_url'> | null
}

export interface AppointmentWithStaff extends Appointment {
  professional: Pick<Professional, 'id' | 'name' | 'avatar_url'> | null
}

// ── Legacy types (backward compat) ────────────────────────────────────────────

export interface AppointmentService {
  id:               string
  tenant_id:        string
  appointment_id:   string
  name:             string
  duration_minutes: number
  price:            number | null
  created_at:       string
}

export interface AvailabilityRule {
  id:                    string
  tenant_id:             string
  day_of_week:           number
  start_time:            string   // "HH:MM"
  end_time:              string   // "HH:MM"
  slot_interval_minutes: number
  slot_duration_minutes?: number
  repeat_type:   RepeatType
  repeat_days:   number[]
  is_active:     boolean
  is_available?: boolean
  created_at?:   string
  updated_at?:   string
}

export interface BlockedTime {
  id:         string
  tenant_id:  string
  start_time: string   // ISO 8601
  end_time:   string   // ISO 8601
  reason:     string | null
  created_by: string | null
  created_at: string
}

export interface TimeSlot {
  start:     string  // ISO 8601
  end:       string  // ISO 8601
  available: boolean
}

export interface AvailabilitySlot {
  starts_at:   string  // ISO 8601
  ends_at:     string  // ISO 8601
  available:   boolean
  staff_id?:   string | null
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreateAppointmentInput {
  tenant_id:             string
  customer_id:           string | null
  staff_id?:             string | null
  appointment_block_id?: string | null
  title:                 string
  description?:          string | null
  starts_at:             string
  ends_at:               string
  location?:             string | null
  notes?:                string | null
  timezone?:             string
  created_by?:           string | null
}

export interface UpdateAppointmentInput {
  title?:                string
  description?:          string | null
  status?:               AppointmentStatus
  starts_at?:            string
  ends_at?:              string
  location?:             string | null
  notes?:                string | null
  timezone?:             string
  staff_id?:             string | null
  appointment_block_id?: string | null
}

export interface SlotAvailabilityResult {
  available: boolean
  reason?:   string
}
