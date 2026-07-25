# Animation review

Review method: Emil `review-animations`, applied after final integration. All timings reference
`lib/design-system/motion.ts`; all Framer Motion consumers inherit user reduced-motion preference
from `DashboardShell`.

| Area              | Evidence                                                               | Severity | Review and resolution                                                                                                                                                                |
| ----------------- | ---------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Application shell | `components/shell/TopBar.tsx`                                          | Pass     | Profile popover enters from its top-right trigger in 180 ms, closes on Escape/outside press, and has no ambient movement.                                                            |
| Command Center    | `components/command-center/GlobalCommandCenter.tsx`                    | Pass     | Pointer opening uses a small 240 ms overlay transition; keyboard opening is instant. Active-result movement runs only for pointer input. Focus is immediate and trapped.             |
| Quick Peek        | `components/command-center/QuickPeek.tsx`                              | Pass     | Drawer origin follows the invoking row/result, movement is 240 ms, backdrop/scroll/focus/history behavior is interruptible, and mobile changes to a bottom-origin full-height sheet. |
| Dashboard         | `components/command-center/OperationsRealtimeProvider.tsx`             | Pass     | Live confirmation is a single finite 720 ms border cue after batched data, not a permanent pulse. Dashboard refresh does not blank the card.                                         |
| Action Required   | `components/command-center/ActionInboxWorkspace.tsx`                   | Pass     | Item removal/reflow is 280 ms and happens only after server-confirmed resolution or dismissal. Focus-item changes are 180 ms. No auto-advance occurs for nonterminal states.         |
| Inspection        | `components/van-damage/DamageLightbox.tsx`, `InspectionExperience.tsx` | Pass     | Image viewer opens from the selected image, crossfades evidence in 120 ms, and restores focus. Level 3 uses one bounded reveal, never a loop or flash.                               |
| Fleet             | `components/van-damage/FleetNeedsAttentionBoard.tsx`                   | Pass     | Filters and authoritative live updates use layout continuity with `initial={false}`; cards do not stagger on page load.                                                              |
| Maintenance       | `components/maintenance/MaintenanceWorkspace.tsx`                      | Pass     | Filtered/reordered items preserve layout in 280 ms. Status changes require inline reason/confirmation and wait for the server before leaving the drawer.                             |
| Forms and setup   | `ActionStatusControls.tsx`, `SetupStepActions.tsx`                     | Pass     | Saving state is explicit, validation is inline, and no shake, bounce, fake progress, or browser prompt remains in these core flows.                                                  |
| Package Manager   | `components/modules/OwnerModulePackageManager.tsx`                     | Pass     | Builder, card reflow, and authoritative add/remove/unchanged diff use bounded layout transitions. Transactional apply still requires explicit confirmation.                          |

## Timing and performance

- Direct feedback: 120 ms.
- Local state: 180 ms.
- Overlay: 240 ms.
- Collection reflow: 280 ms.
- No spring was justified.
- No infinite repeat or permanently blinking indicator exists.
- Transform/opacity handle overlay movement; layout animation is limited to collections that actually
  change.
- The 620 ms Level 3 reveal is intentionally longer than routine UI feedback, runs once, and changes
  only opacity and a restrained inset emphasis.

## Verdict

**Approve.** The motion is purposeful, interruptible, finite, spatially coherent, reduced-motion
aware, and proportionate to an enterprise operations product. Authenticated browser validation is
tracked separately from this source and automated-test review.
