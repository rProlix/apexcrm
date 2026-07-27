# Inspection Compliance and Repair Testing

Automated coverage includes:

- expected slot generation without inspection rows;
- on-time, late, missing-image, failed-analysis, duplicate, excused, and out-of-service behavior;
- denominator and streak rules;
- same-tenant/same-van comparable-prior resolution;
- rejection of invalid latest evidence and upload-order matching;
- mandatory human reviewer enforcement;
- role authorization;
- tenant-scoped schema, RLS, cross-tenant rejection, private evidence references, and provider-neutral wording.

Run:

```bash
npm run test:van-damage
npm run lint
npm run type-check
npm run worker:van:build
npm run build
```

Manual validation should cover desktop/mobile compliance tables, URL filters, private before/after image loading, swipe control, low-confidence warnings, unauthorized repair decisions, human repair confirmation, report export, Action Required synchronization, inactive-module hiding, and tenant-crossing attempts.
