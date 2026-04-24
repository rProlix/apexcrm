// lib/appointments/types.ts

export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'canceled'

export type RepeatType = 'daily' | 'weekly' | 'custom'

export interface Appointment {
  id:          string
  tenant_id:   string
  customer_id: string | null
  title:       string
  description: string | null
  status:      AppointmentStatus
  starts_at:   string  // ISO 8601 timestamp
  ends_at:     string  // ISO 8601 timestamp
  location:    string | null
  notes:       string | null
  timezone:    string
  created_by:  string | null
  created_at:  string
  updated_at:  string
  // Joined fields (optional)
  customer?: {
    id:    string
    name:  string
    email: string | null
  } | null
}

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
  /** 0 = Sunday … 6 = Saturday. Used for repeat_type 'weekly'. */
  day_of_week:           number
  start_time:            string  // "HH:MM"
  end_time:              string  // "HH:MM"
  /** How long each generated slot is, in minutes. */
  slot_interval_minutes: number
  /** Legacy alias — same semantics as slot_interval_minutes. */
  slot_duration_minutes?: number
  /**
   * 'daily'  — applies every day (day_of_week ignored)
   * 'weekly' — applies on day_of_week only
   * 'custom' — applies on days listed in repeat_days
   */
  repeat_type:   RepeatType
  /** Array of 0-6 values used when repeat_type === 'custom'. */
  repeat_days:   number[]
  is_active:     boolean
  /** Legacy alias — same semantics as is_active. */
  is_available?: boolean
  created_at?:   string
  updated_at?:   string
}

export interface BlockedTime {
  id:         string
  tenant_id:  string
  start_time: string  // ISO 8601
  end_time:   string  // ISO 8601
  reason:     string | null
  created_by: string | null
  created_at: string
}

export interface TimeSlot {
  start:     string  // ISO 8601
  end:       string  // ISO 8601
  available: boolean
}

export interface CreateAppointmentInput {
  tenant_id:   string
  customer_id: string | null
  title:       string
  description?: string | null
  starts_at:   string
  ends_at:     string
  location?:   string | null
  notes?:      string | null
  timezone?:   string
  created_by?: string | null
}

export interface UpdateAppointmentInput {
  title?:       string
  description?: string | null
  status?:      AppointmentStatus
  starts_at?:   string
  ends_at?:     string
  location?:    string | null
  notes?:       string | null
  timezone?:    string
}

export interface SlotAvailabilityResult {
  available: boolean
  reason?:   string
}
