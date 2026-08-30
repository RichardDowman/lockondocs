# LockonDocs - Custom Instructions

## Project Overview

**Project:** LockonDocs - Document Scanner and Folder Management Web App
**Client:** Tracey, YoWAD Tech (USA)
**Developer:** Eazi-Business partner (UK-based)
**Purpose:** Browser-based document scanning and secure folder management, designed to be iframed into an existing GoodBarber mobile app.

## Tech Stack

- **Framework:** NextJS (React)
- **Database:** PostgreSQL
- **Cloud Storage:** Amazon S3
- **Camera:** Browser native APIs (getUserMedia)
- **Deployment:** US-based infrastructure (all storage and compute)

## Development Rules

### Workflow

1. **Always start work** by reading these files in order:
   - `CUSTOM_INSTRUCTIONS.md` (this file)
   - `build_state.md`
   - The relevant feature doc for the task (e.g. `scanner.md`, `files.md`, `admin.md`, `production.md`)

2. **NEVER auto-deploy.** Always checkpoint and wait for explicit manual deploy instruction from the developer. As of Build 20 the service was migrated to the new primary host vault.lockondocs.app; deploy there. The previous hosts (securevault.dowmandigitalservices.com and lockondocs.abacusai.app) are pending a retire-or-keep decision from the developer - until confirmed, check with the developer which hosts a deploy should update.

3. **Documentation format:** Always `.md` unless otherwise instructed.

4. **No mention of "Abacus"** in any client-facing output. Use "AI agents" or "AI-powered" if referencing AI capabilities.

5. **No em dashes** in any output. Use hyphens, colons, or rewrite.

6. **Monetary references:** Always in GBP with USD conversion at ~1.27 rate. Example: £100 ($127 USD).

### Build Tracking

- **Build counter:** Track all builds in `build_state.md`. Current counter: 20.
- **Prompt the user** to review/update `build_state.md` every 5 build updates.
- `build_state.md` is **always additive** - never remove entries, only append new ones.

### Feature Documentation

Feature docs live in `/docs/`:
- `scanner.md` - Document scanner feature
- `files.md` - Folder and file management
- `admin.md` - Admin and settings
- `production.md` - Production deployment, security posture and accepted risks

Additional feature docs will be added as the project grows.

## Architecture Principles

### Security

- Documents are **personal and sensitive** (IDs, medical records, school documents).
- **Isolate per user** - strict data separation by user ID. No user can access another user's documents. Access is via time-limited signed URLs.
- **Encryption at rest:** deferred as an accepted risk for now (see `production.md`). It is not built in the current phases; revisit before wider launch.

### Offline-First (design goal, not yet built)

- Local caching of folder structure and recent documents.
- Cloud sync when the device comes back online.
- Graceful handling of offline state in the UI.
- Note: offline capture, caching and sync are not implemented yet.

### Camera and Scanning

- Camera access via **browser native APIs** (getUserMedia, Canvas).
- **No Genius Scan SDK dependency** - pure browser-based approach.
- Must function correctly inside an iframe (GoodBarber context). The live app opens the vault first-party from the GoodBarber home so camera, cookies and login work reliably.

### Iframe Integration

- The app runs inside a GoodBarber mobile app via iframe.
- All features must be tested for iframe compatibility.
- Pay special attention to iOS Safari iframe restrictions (camera, storage, cookies).

## Project Phases

### Phase 1 - Proof of Concept (complete)
- Camera scan, basic folder structure, save and retrieve a document, core schema, cloud storage.

### Phase 2 - Full Feature Build (complete)
- Folder management (rename, delete, move), document search and sorting, user settings and admin panel, enhanced image processing (crop, rotate, brightness/contrast, multi-page, PDF export), built-in folder icons.
- Auth hardening (password policy, reset, soft email verification, lockout), upload validation and storage quota, audit log, data export and account deletion.
- Deferred: encryption at rest (accepted risk), 2FA (note only), custom uploaded folder icons (awaiting Tracey's graphics).

### Phase 3 - GoodBarber Iframe Integration (next)
- Embed app in the GoodBarber shell, auth pass-through if applicable, session management inside the iframe, cross-origin testing and fixes.

### Phase 4 - Launch Prep (optional)
- Performance optimisation, final security audit, user acceptance testing, production deployment.

## Key Contacts

- **Tracey** (YoWAD Tech, USA) - Client, product owner
- **Developer** (Eazi-Business, UK) - Build and deployment

## Quick Reference

| Item | Value |
|---|---|
| Framework | NextJS |
| Database | PostgreSQL |
| Storage | Amazon S3 (US) |
| Camera API | getUserMedia |
| Deploy | Manual only (primary host vault.lockondocs.app) |
| Docs format | .md |
| Currency | GBP (USD at ~1.27) |
| Data sensitivity | High (PII, medical, school) |
| Build counter | 20 |
| Current phase | Phase 2 complete; Phase 3 next |
