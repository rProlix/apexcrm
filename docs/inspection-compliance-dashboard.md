# Inspection Compliance Dashboard

The Inspection Compliance dashboard is available at `/dashboard/damage-ai/compliance` when the Van Damage AI module is active and the signed-in user can view the dashboard.

## Source of truth

`getInspectionComplianceForTenant` generates expected SOD/EOD slots from the tenant schedule and active vehicles before it looks at submissions. A missing submission therefore exists as a real operational result even though no inspection row exists.

The default foundation is weekday SOD and EOD with a 30-minute grace period and four required exterior views. `van_inspection_schedules` stores tenant time zone, operating days, due times, grace periods, required views, and escalation thresholds. `van_inspection_schedule_overrides` supports date-bounded van overrides. Out-of-service vehicles are excluded. Excuses are explicit, attributed records and are excluded from denominators and missed streaks.

## Deterministic status rules

- `complete`: valid, on-time submission with all required views and successful terminal analysis.
- `late`: valid submission after the permitted grace period.
- `images_missing`: the submission lacks one or more configured canonical views.
- `analysis_processing`: a submission is queued/processing, or an upcoming slot is still open.
- `analysis_failed`: evidence was received but terminal analysis failed.
- `partial`: a saved workflow explicitly reports incomplete required steps.
- `needs_review`: the submission is valid but awaits human review.
- `duplicate_submission`, `wrong_van`, and `wrong_inspection_type`: explicit reconciliation states.
- `missing`: no valid submission exists after deadline plus grace.
- `excused`: an authorized, attributed exception exists.

Query failures throw and are shown as application errors; they are never converted to zero issues.

## Metrics

Compliance rate is on-time complete required slots divided by required slots. Completion rate includes late valid submissions. On-time rate is on-time completions divided by completed slots. Excused slots are excluded. Image completeness and analysis success remain separate metrics.

Expected and actual people remain separate. If no authoritative assignment is available, the UI says “No assigned driver”; it never infers one from a prior uploader.
