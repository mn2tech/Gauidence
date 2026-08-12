# Phone Storage Connection (v1)

Guardian Phone Storage is the first external connector. It discovers **file metadata only** from a user-selected folder. Files stay on the device.

## Platform note

This repository is a **Next.js web app** (not Expo / React Native). Folder access uses:

1. **Compatible picker (default):** `<input webkitdirectory>` — works with Downloads and other well-known folders that Chrome blocks in `showDirectoryPicker`.
2. **Persistent picker (optional):** Chromium File System Access API (`showDirectoryPicker`) — can persist a `FileSystemDirectoryHandle` in IndexedDB, but Chrome blocks Downloads, Documents, Desktop, Pictures, etc. Use a **subfolder** (e.g. `Downloads/Guardian`) instead.

True Android `ACTION_OPEN_DOCUMENT_TREE` / SAF persistent permissions require a future **native Android shell or Expo development build**. The `AndroidStorageConnector` interface is ready for that swap without changing Supabase schema or UI contracts.

## Routes

| Path | Purpose |
|------|---------|
| `/settings/connections` | Connected sources cards |
| `/settings/connections/[id]` | Browse discovered files |
| `/settings/connections/[id]/files/[itemId]` | File metadata detail |

## APIs

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/connections` | List / create |
| GET/PATCH/DELETE | `/api/connections/[id]` | Read / update / disconnect |
| POST | `/api/connections/[id]/scan` | Upsert scan metadata |
| GET | `/api/connections/[id]/items` | List / filter items |
| GET | `/api/connections/[id]/items/[itemId]` | Item detail |

## Migration

`supabase/migrations/0077_connected_sources.sql`

## Feature flag

`NEXT_PUBLIC_GUARDIAN_SOURCE_ANALYZE=true` shows a disabled **Analyze with Guardian** placeholder on file detail (processing not implemented).

## Manual test (Chromium desktop or Android Chrome)

1. Settings → Connections → Connect Phone Storage  
2. Choose a folder (e.g. Downloads)  
3. Confirm files appear after scan  
4. Close / reopen Guardian — connection should remain (Chromium + IndexedDB)  
5. Add a file → Scan Again → new file appears, no duplicates  
6. Remove a file → Scan Again → status `unavailable`  
7. Disconnect → confirm scanning stops  

Do not expect unrestricted “entire phone” access — only the selected folder.
