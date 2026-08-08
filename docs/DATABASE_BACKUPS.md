# Guardian — Supabase database backups

Guardian stores user data in **Supabase** (PostgreSQL + Storage). This guide covers daily automated backups for production.

## Recommended approach (pick one)

| Method | Best for | Cost |
|--------|----------|------|
| **Supabase Pro backups** | Easiest, zero maintenance | Included with Pro ($25/mo+) — daily backups + PITR |
| **`pg_dump` script (this repo)** | Free tier or full control | Free (your cron host) |
| **GitHub Actions scheduled workflow** | Hands-off automation | Free tier minutes |

Storage files (uploaded documents) are **not** included in SQL dumps. Back up the `documents` bucket separately (see [Storage backups](#storage-backups) below).

---

## Prerequisites

1. **Supabase project** — [supabase.com/dashboard](https://supabase.com/dashboard)
2. **Database connection string** (URI mode):
   - Dashboard → **Project Settings** → **Database** → **Connection string** → **URI**
   - Use the **Session pooler** or **Direct** connection for `pg_dump` (not Transaction pooler on port 6543 for dumps in some setups — Direct on port 5432 is most reliable).
3. **`pg_dump`** installed locally or on the machine running the cron job:
   - Windows: install [PostgreSQL](https://www.postgresql.org/download/windows/) (includes `pg_dump`)
   - macOS: `brew install libpq` and add to PATH
   - Linux: `apt install postgresql-client`

---

## Option A — Run the backup script manually

### Windows (PowerShell)

```powershell
# Set once per session (never commit this value)
$env:SUPABASE_DB_URL = "postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"

.\scripts\backup-supabase.ps1
```

### macOS / Linux / CI

```bash
export SUPABASE_DB_URL="postgresql://postgres.[ref]:[password]@..."
./scripts/backup-supabase.sh
```

Output lands in `backups/guardian-YYYY-MM-DD-HHmmss.sql.gz` (gitignored).

---

## Option B — Daily cron on your machine or VPS

### Windows Task Scheduler

1. Open **Task Scheduler** → Create Basic Task
2. Trigger: **Daily** at 2:00 AM (low-traffic window)
3. Action: **Start a program**
   - Program: `powershell.exe`
   - Arguments: `-ExecutionPolicy Bypass -File "C:\Users\kolaw\Projects\Gauidence_AI\scripts\backup-supabase.ps1"`
4. Store `SUPABASE_DB_URL` in your user environment variables (System Properties → Environment Variables)

### Linux cron

```cron
0 2 * * * SUPABASE_DB_URL='postgresql://...' /path/to/Gauidence_AI/scripts/backup-supabase.sh >> /var/log/guardian-backup.log 2>&1
```

---

## Option C — GitHub Actions (scheduled)

1. Add repository secret: **Settings → Secrets → Actions**
   - `SUPABASE_DB_URL` = your connection URI
2. Create `.github/workflows/backup-supabase.yml` (example below)
3. Artifacts are retained 30 days by default — copy to S3/Drive for long-term retention.

```yaml
name: Supabase backup
on:
  schedule:
    - cron: "0 7 * * *" # 07:00 UTC daily
  workflow_dispatch:

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run backup
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
        run: ./scripts/backup-supabase.sh
      - uses: actions/upload-artifact@v4
        with:
          name: supabase-backup-${{ github.run_id }}
          path: backups/*.sql.gz
          retention-days: 30
```

---

## Option D — Supabase dashboard (Pro plan)

If you upgrade to **Supabase Pro**:

1. Dashboard → **Project Settings** → **Database** → **Backups**
2. Daily backups are automatic; enable **Point-in-Time Recovery (PITR)** for restore to any second in the retention window.
3. Still export a monthly `pg_dump` for off-platform copies.

---

## Storage backups

SQL dumps do **not** include files in Supabase Storage (`documents`, `profile-avatars`, etc.).

**Manual export (small projects):**

- Dashboard → **Storage** → select bucket → download folders periodically.

**Automated (recommended at scale):**

- Use the Supabase Storage API or `rclone` with a service role key to sync buckets to S3/Google Cloud Storage on a schedule.
- Or enable Supabase’s backup add-ons / replicate buckets to cold storage.

---

## Restore a SQL backup

```bash
# Decompress
gunzip -c backups/guardian-2026-08-08-020000.sql.gz > restore.sql

# Restore to a *staging* database first — never blindly overwrite production
psql "$STAGING_DB_URL" -f restore.sql
```

Test restores quarterly. A backup you’ve never restored is only a hope.

---

## Retention policy (suggested)

| Copy | Retention |
|------|-----------|
| Daily local/GitHub artifact | 30 days |
| Weekly copy to external drive or S3 | 90 days |
| Monthly archive | 1 year |

---

## Security checklist

- [ ] `SUPABASE_DB_URL` is only in env vars / secrets — never in git
- [ ] Backup files are encrypted at rest (BitLocker, S3 SSE, etc.)
- [ ] Access to backups is limited to admins
- [ ] `backups/` is in `.gitignore` (already configured)
- [ ] Rotate the database password if a backup file is ever exposed
