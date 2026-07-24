# Inspection Metadata access

Inspection Metadata is platform diagnostic information and is available only when the
canonical authenticated `public.users.role` is exactly `owner`. A tenant `admin` does
not satisfy this boundary.

The server page resolves the role before building client props. Non-owner requests:

- do not query AI-run input summaries or job payloads;
- receive an explicit safe inspection object rather than the database row;
- receive only sanitized lifecycle, comments, and audit presentation fields;
- never receive storage keys from comment attachments;
- do not receive the owner metadata prop;
- do not render a metadata section, navigator entry, export action, or copy-ID action.

The dedicated metadata endpoint uses `resolvePlatformOwnerAccess` and returns a safe
401/403 before checking inspection existence. Owner results are tenant-scoped and
contain grouped source, processing, storage, and database status only. They exclude
tokens, credentials, raw provider responses, queue payloads, storage keys, and signed
URLs.

Owner metadata is marked `no-print`. Metadata access and authenticated rejection are
audited without recording sensitive payloads.

Rollback consists of removing the owner diagnostic endpoint and presentation; it must
not restore the previous behavior of passing raw rows or payloads to tenant clients.
