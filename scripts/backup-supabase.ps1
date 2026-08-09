# Daily Supabase PostgreSQL backup for Guardian.
# Requires: pg_dump in PATH, gzip (Git for Windows includes gzip)
# Env: SUPABASE_DB_URL (postgresql://... connection URI from Supabase dashboard)

$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$BackupDir = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { Join-Path $RootDir "backups" }
$RetentionDays = if ($env:BACKUP_RETENTION_DAYS) { [int]$env:BACKUP_RETENTION_DAYS } else { 30 }

if (-not $env:SUPABASE_DB_URL) {
  Write-Error "SUPABASE_DB_URL is not set. Get it from Supabase Dashboard -> Project Settings -> Database -> Connection string (URI)."
}

$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) {
  Write-Error "pg_dump not found. Install PostgreSQL client tools and add pg_dump to PATH."
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$stamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd-HHmmss")
$outFile = Join-Path $BackupDir "guardian-$stamp.sql.gz"
$sqlFile = Join-Path $BackupDir "guardian-$stamp.sql"

Write-Host "Backing up to $outFile ..."

& pg_dump $env:SUPABASE_DB_URL --no-owner --no-privileges --format=plain --file=$sqlFile

$gzip = Get-Command gzip -ErrorAction SilentlyContinue
if ($gzip) {
  & gzip -9 -f $sqlFile
} else {
  # Fallback: PowerShell Compress-Archive (less ideal but works without gzip)
  $zipFile = "$outFile".Replace(".sql.gz", ".zip")
  Compress-Archive -Path $sqlFile -DestinationPath $zipFile -Force
  Remove-Item $sqlFile -Force
  $outFile = $zipFile
  Write-Warning "gzip not found; saved as $zipFile instead."
}

$bytes = (Get-Item $outFile).Length
Write-Host "Done. Size: $bytes bytes"

if ($RetentionDays -gt 0) {
  $cutoff = (Get-Date).AddDays(-$RetentionDays)
  Get-ChildItem $BackupDir -Filter "guardian-*" -File |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    Remove-Item -Force
  Write-Host "Pruned backups older than $RetentionDays days."
}
