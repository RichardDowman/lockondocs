# Offline Access - Delivery Plan

## Overview

| Field | Value |
|---|---|
| Document | Plan for adding offline access to LockonDocs |
| Prepared | 2026-10-06, after Build 40 (docs only, no build number) |
| Status | Plan only. Nothing is built. Needs Tracey's answers, an agreed commercial treatment and a go-ahead |
| Builds on | sharing_offline_review.md (what was promised, what happened, constraints) |
| First step | Step 0 proof of concept inside the GoodBarber app, before anything else is quoted |

## 1. What offline access means for LockonDocs

With no signal, a user who has turned offline access on for their phone can:

1. Open LockonDocs from the GoodBarber app and unlock it with their password.
2. See their vaults, document names and document details.
3. Open and zoom the documents that are kept on the phone.
4. Scan a new document and save it. It uploads by itself when the signal returns.
5. (Later step) Rename, move or edit the details of a document. The change is sent when the signal returns.

What stays online-only, by design:

- Signing in for the first time on a phone, creating an account, password reset and email verification.
- Deleting documents or vaults, account deletion, data export and the admin panel.
- Search across documents that are not kept on the phone.
- Expiry reminder emails (these come from the server as now; the in-app reminder list works offline from the saved details).

## 2. Guiding principles

- The cloud copy is always the master. Anything on the phone is a convenience copy that can be cleared and downloaded again.
- Off by default. Each phone is opted in by the user ("Keep my documents on this phone"), so a shared or borrowed phone never holds copies.
- Encrypted on the phone. Everything kept on the phone, including the details, is encrypted by the app, and can only be read after the user enters their password.
- The auto-lock still applies offline, with the same 1/3/5/10 minutes or Never setting.
- Masked sensitive values stay masked offline and still need the password to reveal.
- The app never claims more than is true: clear "Offline", "Saved on this phone" and "Waiting to upload" labels at all times.

## 3. How the app works today (relevant parts)

- Every screen (vaults, vault, document, scanner) is drawn in the browser and loads its data from the app's own server as JSON. This is helpful: the screens can be pointed at an on-phone copy of the same data without being rebuilt.
- Document images and PDFs are streamed through the app's own address (/api/files/...) after a signed-in check, so the phone already receives the full file when a document is opened.
- Saving a scan is three calls: get a secure upload address, upload the file to US cloud storage, then save the document record.
- The scanner's detection libraries are loaded from two public sites (opencv.org and jsdelivr) each time. Offline scanning needs them stored inside the app instead.
- The unlock screen checks the password with the server. Offline it must be checked on the phone.
- There is no service worker, no on-phone database and no upload queue.

## 4. Constraints and risks

| Risk | Why it matters | How the plan handles it |
|---|---|---|
| GoodBarber on iPhone | The vault opens in GoodBarber's in-app browser. On iOS, a page inside another company's app can only use a service worker (the piece that lets a web app open with no signal) if that app opts in through Apple's App-Bound Domains setting, which GoodBarber controls. Which in-app browser GoodBarber uses decides this | Step 0 tests it on Tracey's iPhone 14 Pro Max before any other work. Richard to ask GoodBarber whether vault.lockondocs.app can be added as an app-bound domain |
| Phone storage can be cleared | iOS and Android can clear website storage when space is low, and Safari based browsers can clear it after a period without use | The app asks the phone to keep its storage (persistent storage request), shows "last synced" times and treats the copy as a convenience. The cloud copy is never affected |
| Sensitive data on the phone | IDs and medical records would sit on the device | Opt-in per phone, app-level encryption, password needed to read, wiped on sign-out, after repeated wrong passwords and when the account is deleted or the phone is removed in Settings |
| Storage size | High-quality scans since Build 38 are large (several MB each) | A storage limit per phone (suggested default 250 MB, user can change), most recent first, plus a per-document "Keep offline" pin |
| Duplicates when the signal returns | A scan could upload twice if the connection drops mid-upload | Every queued scan carries a one-time ID; the server ignores a second save with the same ID |
| Changes on two phones | The same document edited offline on two phones | Field-by-field merge; if both changed the same field, the user chooses (Step 3 only) |
| Signed out while offline | The sign-in session can expire during a long offline period | Offline viewing does not need the session. Queued uploads wait, encrypted, until the user signs in again |

## 5. Delivery steps

Each step is useful on its own and has a go or no-go point. Effort figures are estimates in builds, for planning only, not a quote.

### Step 0 - Proof of concept (estimate: 1 build)

Purpose: find out whether offline storage works inside the GoodBarber app at all.

- A hidden test page (not linked from the app, holds no documents) that installs a service worker, writes and reads an encrypted test record on the phone, asks for persistent storage and reports the results on screen.
- Test script, run by Tracey on her iPhone 14 Pro Max and by Richard on one Android phone:
  1. Open the test page from the GoodBarber app with signal. Note the results.
  2. Close GoodBarber fully, turn on Airplane Mode, reopen GoodBarber and the vault section.
  3. Does the test page open? Is the test record still readable?
  4. Repeat after 24 hours and after a phone restart.
- Decision:

| Result | What it means | Next |
|---|---|---|
| Page opens offline and the record survives | Full offline is possible | Steps 1 to 3 |
| Page does not open offline, but the record survives | The app cannot start with no signal, but it can keep working if the signal drops while it is open | Plan B (section 6) |
| Neither works | GoodBarber's browser blocks offline storage | Plan C (section 6) |

### Step 1 - Read-only offline vault (estimate: 3 to 4 builds)

- App shell kept on the phone: a service worker stores the app's screens, styles, fonts and logo so LockonDocs opens with no signal. Screens already opened are served from the phone; anything else falls back to an "Offline vault" screen built from the on-phone copy.
- On-phone vault: an encrypted on-phone database holding the vault list, document names, details, thumbnails and the full files of documents kept offline.
- Encryption: a random key is created on the phone for each user and locked with a key made from the user's password (strong key stretching). The locked key is useless without the password. If the password is changed or reset, the on-phone copy is cleared and downloaded again.
- Which documents are kept: the most recently viewed or saved documents up to the storage limit, plus any the user pins with "Keep offline". Vault-level pins are an option (see questions).
- Sync: a new server endpoint returns what has changed since the last sync (new, changed and removed documents and vaults). It runs when the app opens, when the signal returns, after each save and at most every few minutes while open.
- Offline unlock: the lock screen checks the password on the phone by unlocking the key. After 10 wrong attempts offline, the on-phone copy is wiped (the cloud copy is untouched).
- Device list: a new, additive table of phones that have offline access, shown in Settings with "Remove this phone". A removed phone, or any phone of a deleted or suspended account, wipes its copy the next time it connects.
- Settings, new Offline section: "Keep my documents on this phone" toggle, storage used and limit, last sync time, "Clear copies on this phone" and the device list. This completes the two Settings items still open in admin.md (clear local cache, last sync time).
- UI: an "Offline" banner, a "Saved on this phone" badge on documents, and a clear message on documents that are not kept offline.
- Activity log: documents opened offline are noted on the phone and added to the user's activity log on the next sync.
- Acceptance: with Airplane Mode on, the user opens LockonDocs from GoodBarber, unlocks with their password, browses vaults and opens a kept document. Signing out leaves nothing readable on the phone.

### Step 2 - Offline scanning (estimate: 2 builds)

- The scanner's detection libraries (OpenCV and jscanify) are served from the app itself and kept on the phone, so auto-detect and auto-grab work with no signal. The OpenCV file is large (around 8 to 10 MB), so it is downloaded once when offline access is turned on.
- The vault picker, the paged details card and the thumbnail framer work from the on-phone vault list.
- "Save document" with no signal stores the finished pages or PDF, thumbnail and details encrypted in an upload queue on the phone, shows "Waiting to upload" and adds the document to the vault list straight away with that label.
- The queue uploads by itself when the signal returns and the user is signed in, using the existing three-call save with a one-time ID so nothing is saved twice. Progress shows as "Uploading 1 of 3".
- Problems are shown, never silently dropped: storage quota full, file rejected, or sign-in needed. The queued item stays on the phone until it uploads or the user removes it.
- iPhones do not support background upload for web apps, so uploads run when LockonDocs is open. Android may also upload in the background where supported.
- Acceptance: scan two documents in Airplane Mode, close the app, turn the signal back on, open the app, and both documents appear once each in the right vault with the right details.

### Step 3 - Offline changes (optional, estimate: 2 builds)

- Rename, move to another vault, edit details, set the custom thumbnail and pin offline, all queued and sent when the signal returns.
- Conflict rule: changes are merged field by field. If the same field was changed on another phone since the last sync, the user sees both values and chooses.
- Deleting stays online-only, so a document cannot be lost by an offline mistake.

### Step 4 - Testing and sign-off (estimate: 1 build)

- Devices: Tracey's iPhone 14 Pro Max inside GoodBarber, one Android phone inside GoodBarber, and a desktop browser.
- Scenarios:
  1. First use: turn offline on, watch the first sync finish, check the storage figure.
  2. Airplane Mode: open, unlock, browse, open a kept document, try one that is not kept.
  3. Auto-lock offline: wait past the lock time, unlock with the password, wrong password 10 times wipes the copy.
  4. Offline scan: scan, save, close, reconnect, confirm one upload each.
  5. Signal drops in the middle of an upload.
  6. Storage full on the phone and storage quota full on the account.
  7. Sign out, password change, account deletion and "Remove this phone" each wipe the copy.
  8. Two phones: change on one, check the other after sync (and conflicts, if Step 3 is built).
  9. Reopen after 24 hours and after a phone restart.
- Docs: new offline sections in scanner.md, files.md, admin.md and production.md; the custom instructions updated so offline is no longer "not yet built".

## 5A. Installed offline vault (Build 42 direction)

The Step 0 results on Android showed that offline works once our page opens first-party, but the GoodBarber section itself needs a connection on a cold start. The installed vault avoids that dependency.

- **The switch:** an "Offline vault" switch in Settings, off by default. Switching it on starts the home screen install for that phone.
- **Same account, same data:** the installed vault signs in to the same LockonDocs account and works on the same cloud documents as the vault inside GoodBarber. It is not a separate vault.
- **Offline changes sync:** scans and changes made with no signal are kept encrypted on the phone and pushed to the live account on the next connection (Step 2 and Step 3 above). The GoodBarber vault then shows them as normal.
- **Per phone parts only:** the encrypted on-phone copy and one sign-in after installing (an installed app keeps its own storage, separate from GoodBarber's browser).
- **How the install starts:** where the phone allows it, straight from the switch. If the in-app browser cannot install (Android WebView never offers the install prompt; iPhone only installs from Safari), switching it on opens the phone's own browser (Chrome or Safari) on the same page with the install sheet already open. Copy link is always offered as a backup.
- **Status:** Build 42 adds this flow to the test page only (offline_poc_test.md, Part E). The real Settings switch follows once Part E passes on Samsung and iPhone.

## 6. Fallback plans

### Plan B - Signal drops while the app is open

If Step 0 shows the app cannot start with no signal but on-phone storage works:

- Build the encrypted upload queue from Step 2 (with the scanner libraries stored in the app) so a scan is never lost when the signal drops mid-session. It uploads when the signal returns.
- Keep the vault list and recently opened documents available while the app stays open.
- Estimate: 2 to 3 builds.

### Plan C - GoodBarber blocks offline storage

- Ask GoodBarber to add vault.lockondocs.app as an app-bound domain, or whether they offer an offline option for custom sections. Repeat Step 0 if they make a change.
- Meanwhile, improve the existing Download button with a "Save to Files" hint, so users can keep their own copies of key documents (for example ID or insurance card) that open with no signal from the phone's Files or Photos app.
- Estimate: under 1 build for the Download improvements.

## 7. Security and production notes

- On-phone copies use app-level encryption (AES-256 in the browser's built-in cryptography). This is separate from the cloud storage encryption (SSE-S3) and does not change it. The production.md accepted risk on encryption at rest for cloud storage stays as it is, and the docs must not claim more.
- Nothing kept on the phone is readable without the password: not the details, not the thumbnails, not the files.
- The per-user rules stay: the sync endpoint only ever returns the signed-in user's own data, and the device list is scoped by user.
- The database change is additive (a new device table and a one-time ID on documents). No existing data changes.
- No change to framing headers or to the first-party opening of the vault.

## 8. Effort summary (estimates only)

| Step | What the user gets | Estimate |
|---|---|---|
| 0 | Proof of concept and go or no-go | 1 build |
| 1 | Open, unlock and read kept documents with no signal | 3 to 4 builds |
| 2 | Scan and save with no signal, uploads later | 2 builds |
| 3 | Optional: offline renames, moves and detail edits | 2 builds |
| 4 | Device testing, docs and sign-off | 1 build |

Price is for Richard to set once the commercial treatment is agreed. Offline was one of the proposal's Phase 2 bullets (Phase 2 £2,000 ($2,540 USD)) and was recorded as deferred in Build 11, so Richard and Tracey should first agree whether it is an outstanding Phase 2 item, a new separately quoted phase, or reduced to Plan B or Plan C. The proposal's 20% contingency was £600 ($762 USD); whether any of it remains is for Richard to confirm.

## 9. Questions for Tracey

1. With no signal, what must work: viewing saved documents, scanning new ones, or both? (This decides whether Step 1, Step 2 or both come first.)
2. Which documents should be kept on the phone: the most recent, ones the user pins, whole vaults, or all of them?
3. Is a default limit of 250 MB per phone acceptable?
4. Should any vault be excluded from offline copies by default (for example Medical and Emergency)?
5. Is wiping the on-phone copy after 10 wrong passwords offline acceptable?
6. Are offline renames and detail edits (Step 3) needed, or is viewing and scanning enough?
7. Can GoodBarber confirm whether their iOS app allows offline web storage (App-Bound Domains) for vault.lockondocs.app?
8. Can you run the Step 0 test on your iPhone 14 Pro Max (about 10 minutes, plus a check the next day)?

## 10. Recommended order

1. Agree the commercial treatment of offline access.
2. Richard contacts GoodBarber about App-Bound Domains, and Tracey answers the questions above.
3. Build and run Step 0.
4. Based on the result, go ahead with Steps 1, 2 and 4 (and 3 if wanted), or Plan B, or Plan C.
