# Archived evidence retrieval

Archived evidence remains private and tenant-scoped. The intended restore flow is:

1. Owner or authorized tenant admin requests access to archived evidence.
2. The system creates an `archive_restore_requests` row.
3. Infrastructure restores the S3 object if the storage class requires retrieval.
4. The application issues a normal short-lived signed URL after access checks pass.

The UI must never show permanent evidence links. Restore state should be communicated as pending, available, failed, or expired.
