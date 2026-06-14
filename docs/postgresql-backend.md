# PostgreSQL Backend

ZTF-Orchestrator defaults to PostgreSQL for Docker deployments.
File-backed state remains available for simple local testing. PostgreSQL is used
for enterprise deployments that need database-backed users,
sessions, settings, execution history, schedules, approvals, parallel runs,
pipelines, drift results, and audit events.

## Storage Modes

```text
ZTF_STORAGE_BACKEND=postgres  # default Docker behavior
ZTF_STORAGE_BACKEND=file      # optional JSON-file behavior
```

When PostgreSQL mode is enabled, the server creates the required schema on startup.
Current database-backed documents include:

- `users.json`
- `settings.json`
- `history.json`
- `pipelines.json`
- `drift.json`
- `schedules.json`
- `parallel_runs.json`
- `approvals.json`
- `jobs.json`

Structured audit entries are also written to the `ztf_audit_events` table, and
login sessions are stored in `ztf_sessions`.

Executions are submitted as durable jobs. The API stores job status and log
events before a background worker launches the ZeroTouch Framework subprocess,
which keeps long-running workflows independent from the browser session.

## Docker Compose

PostgreSQL-backed mode is the default:

```bash
cp .env.example .env
# Edit .env and set a unique POSTGRES_PASSWORD.
docker compose up -d --build
```

File-backed mode uses the standalone Compose file:

```bash
docker compose -f docker-compose.file.yml up -d --build
```

`docker-compose.yml` requires `POSTGRES_PASSWORD` to be set. The recommended
path is to copy `.env.example` to `.env`, set a unique password, then start the
stack.

```bash
POSTGRES_PASSWORD='use-a-unique-value' docker compose up -d --build
```

For one-off Windows PowerShell usage:

```powershell
$env:POSTGRES_PASSWORD="use-a-unique-value"
$env:ZTF_DATABASE_URL="postgresql://ztf:use-a-unique-value@postgres:5432/ztf_orchestrator"
docker compose up -d --build
```

The password embedded in `ZTF_DATABASE_URL` must match `POSTGRES_PASSWORD`.
For repeatable starts, place both values in `.env` instead of setting them only
for the current PowerShell session.

## Environment Variables

```text
ZTF_STORAGE_BACKEND=postgres
ZTF_DATABASE_URL=postgresql://ztf:<POSTGRES_PASSWORD>@postgres:5432/ztf_orchestrator
ZTF_EXEC_WORKERS=1
```

For managed PostgreSQL, set `ZTF_DATABASE_URL` to the managed database connection
string and do not run the bundled `postgres` service.

## Schema

The MVP backend intentionally stores the existing JSON document shapes in a
PostgreSQL document table:

```text
ztf_documents
  name        text primary key
  data        jsonb
  updated_at  timestamptz

ztf_audit_events
  id          bigserial primary key
  ts          timestamptz
  level       text
  msg         text
  username    text
  action      text
  workflow    text
  status      text
  ip          text
  event       jsonb

ztf_sessions
  token       text primary key
  username    text
  role        text
  expires_at  timestamptz
  created_at  timestamptz
```

This keeps the first migration low-risk because the API can preserve the current
data model while moving the backing store to PostgreSQL.

## Import Existing JSON State

To migrate an existing file-backed appliance into PostgreSQL:

```bash
python scripts/migrate_json_to_postgres.py \
  --data-dir /var/lib/ztf-orchestrator \
  --database-url postgresql://ztf:ztf@postgres:5432/ztf_orchestrator
```

Use `--overwrite` to replace documents that already exist in PostgreSQL.

## Retention

Retention settings:

```text
ZTF_AUDIT_RETENTION_DAYS=90
ZTF_EXECUTION_RETENTION_DAYS=180
```

Admins can run retention cleanup through:

```text
POST /api/maintenance/retention
```

In PostgreSQL mode this removes expired sessions and old audit events. File mode
continues to use existing per-document limits.

## On-Demand Logical Backups

Admins can create PostgreSQL logical backups from **Settings > Storage** or via:

```text
POST /api/maintenance/database-backups
GET  /api/maintenance/database-backups
GET  /api/maintenance/database-backups/<filename>
POST /api/maintenance/database-backups/<filename>/restore
```

Backups are created with `pg_dump --format=custom --no-owner --no-privileges`
and stored under:

```text
ZTF_DATA_DIR/backups/postgres/
```

The Docker image includes `postgresql-client` so `pg_dump` and `pg_restore` are
available in the standard container deployment. For manual installations,
ensure both commands are on the service `PATH`.

These backups are intended for lab, Docker, and small-team deployments. For
managed PostgreSQL, prefer platform-native automated backups and recovery
policies.

Admin restore is available from **Settings > Storage**. The restore flow requires
a typed `RESTORE` confirmation, creates a safety backup first, runs
`pg_restore --clean --if-exists --single-transaction`, records the event in the
audit log, and recommends an application restart afterwards so in-memory
sessions and workers reload restored state. Treat restore as a recovery action,
not a routine operational button.
