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

2. **NEVER auto-deploy.** Always checkpoint and wait for an explicit manual deploy instruction from the developer. vault.lockondocs.app is the single live host and the only deploy target. The previous hosts (securevault.dowmandigitalservices.com and lockondocs.abacusai.app) were retired on 2026-08-31.

3. **Documentation format:** Always `.md` unless otherwise instructed.

4. **No mention of "Abacus"** in any client-facing output. Use "AI agents" or "AI-powered" if referencing AI capabilities.

5. **No em dashes** in any output. Use hyphens, colons, or rewrite.

6. **Monetary references:** Always in GBP with USD conversion at ~1.27 rate. Example: £100 ($127 USD).

### Build Tracking

- **Build counter:** Track all builds in `build_state.md`. Current counter: 37.
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

## Client Architecture Phases (Digital Vault Architecture document)

These are the tiers from Tracey's Digital Vault Architecture brief, tracked separately from the delivery phases above. All three are built (Builds 25 to 31) and awaiting manual deploy.

### Phase A - Structured vault fields (built, Build 25)
- Per-vault metadata fields, a custom field builder, and cross-field search so users can store and find structured details (for example an ID number or policy number) alongside each document.

### Phase B - Expiry reminders (built, Builds 28 to 30)
- In-app expiry reminders (bell/badge), plus two branded reminder emails per expiry cycle: one "expiring soon" (within 30 days) and one "expired". No push notifications, because the app runs embedded in the GoodBarber shell. A per-user opt-out toggle and an admin email log are included. Build 30 fixed a 30-day boundary so a document exactly 30 days out is included.

### Phase C - Access security (built, Build 31)
- Auto-lock (choices 1, 3, 5, 10 minutes or Never; default 5) that also locks on return when the app has been left in the background for at least that same period (Build 34 changed this from locking on any return), masked sensitive field values that require a password reveal, and a re-authentication endpoint. The lock is an in-app overlay, not a sign-out, so the GoodBarber session survives, and it is never shown straight after a sign-in.
- Still open (need a separate go-ahead): document sharing, multi-person profiles, encryption at rest (accepted risk, not built).

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
| Build counter | 37 |
| Current phase | Phases 1 and 2 complete; client Phases A, B and C built (Builds 25 to 31); Phase 3 (GoodBarber) next |
