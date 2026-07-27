# Repair Verification

Repair verification compares original confirmed evidence with new private post-repair evidence. Automated assessment can suggest that damage appears repaired, partially repaired, remains visible, or cannot be verified. It cannot finalize the repair.

`van_damage_repairs` owns the repair lifecycle. `van_damage_repair_verifications` stores advisory assessment separately from the human decision. `van_damage_repair_verification_images` preserves stable evidence IDs, canonical view, quality, comparability, replacement history, and uploader.

Final “Verified Repaired” requires all of:

- human decision `confirm_repaired`;
- a real reviewer ID;
- a review timestamp.

A database check and trigger enforce this rule even for service-role/background callers. The server decision API independently requires an authenticated tenant manager/administrator, validates tenant ownership, records before/after audit metadata, updates the linked case, and resolves related action work only after human confirmation.

Weak evidence must be labeled “Images are insufficient to verify the repair.” The UI always presents AI output as an assessment requiring human confirmation.
