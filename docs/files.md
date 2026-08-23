# Folder and File Management

## Feature Overview

| Field | Value |
|---|---|
| Feature name | Folder and File Management |
| Status | Phase 1 complete; Phase 2 complete (custom icon graphics deferred) |
| Phase | Phase 1 (basic) + Phase 2 (full) |
| Priority | High |

## Description

Users can create, rename, and delete folders to organise their scanned documents. The system provides a set of pre-created default folders and allows users to add their own. Documents can be viewed, moved between folders, searched, and sorted.

> Terminology note (Build 14): the user-facing label for a folder is now "Vault" (plural "Vaults") throughout the app. This is a display-only rename. The underlying data model, API routes, URLs and code identifiers still use "folder" for stability, so this doc continues to use "folder" when describing the implementation.

## Phase 1 Requirements (Basic)

- [x] Pre-created default folders for new users (Personal, School, Medical, Work, Other)
- [x] Create new folder (custom name)
- [x] Save scanned document to a selected folder
- [x] View list of documents in a folder
- [x] View/preview a document (image viewer; PDF shown as an icon with open/download)

## Phase 2 Requirements (Full)

- [x] Rename folders
- [x] Delete folders (with confirmation dialog)
- [x] Move documents between folders
- [x] Delete documents (with confirmation dialog)
- [x] Search documents (by name, scoped to the signed-in user)
- [x] Sort documents by date or name
- [x] Folder icons - built-in icon set live; custom graphics from Tracey deferred

## Implemented Behaviour (Phase 2)

### Folder icons

- Folders support a built-in icon picker offering a curated set of choices (folder, personal, education, medical, work, document, wallet, home, travel, vehicle).
- The icon can be chosen when creating a folder and changed later via the folder Rename dialog. The selection persists through the folder update endpoint.
- Custom uploaded folder icons (client-supplied graphics from Tracey) are deferred until those image assets are provided. When the assets arrive, they can be added as additional choices or as an upload option without changing the storage model.

### Move, rename, delete

- Documents can be moved to any of the user's folders from the document view; the target folder ownership is verified server-side.
- Deleting a folder removes its documents and decrements the owner's storage usage.
- Rename is capped at 60 characters.

### Search and sorting

- A dedicated search screen (`/search`) calls `/api/search`.
- Search is case-insensitive name matching, scoped to the signed-in user, with an optional folder filter.
- Sort options: date newest, date oldest, name A to Z, name Z to A.

### PDF documents

- Documents saved as PDFs (multi-page scans) render a PDF placeholder icon in the folder grid and a PDF panel with an open/download action in the document view, rather than a broken image thumbnail.

## Technical Notes

### Database Schema

- Folders table: id, user_id, name, icon, is_default, created_at, updated_at.
- Documents table: id, user_id, folder_id, name, cloud_storage_path (S3), mime_type, file_size, thumbnail_path, is_public, created_at, updated_at.
- Default folders are created automatically on user registration.

### Cloud Storage

- Document files are stored in Amazon S3 (US).
- Access is via time-limited signed URLs.
- The data export's document links route through the app's own domain via /api/files/[id] (added Build 13), which streams the file server-side so the storage host is never exposed. The route is session-gated and scoped by user ID. (The in-app document viewer still opens files via time-limited signed URLs directly.)

### User Isolation

- All queries are filtered by user_id.
- No cross-user data access at any level.
- S3 paths are scoped to the user ID.

### Storage Quota

- Each user has a storage limit (default 5GB). Uploads are checked against remaining quota and rejected with a clear error when the limit would be exceeded.

### UI Considerations

- Mobile-first layout (designed for phone screens inside GoodBarber).
- Thumbnail grid for documents, list for recent items.
- Tap to preview, menu for actions.
- Empty-state messaging for new users.

### Offline Support (deferred)

- Local caching, offline queueing and sync are not implemented yet. This remains a later-phase design goal.

## Dependencies

- Scanner feature (provides documents to store)
- Authentication system (provides user ID)
- Database schema (folders and documents tables)
- Cloud storage setup (S3 bucket and API)
