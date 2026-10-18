# Document Sharing and Offline Access - Review

## Current sharing decision and implementation (10/14/2026, Build 46)

Richard confirmed sharing is outstanding original-scope work, not a new separately quoted addition. This supersedes every contrary scope statement in the historical Build 40 review below. Richard approved no-account sharing with a required passcode delivered separately. Build 46 implements owner password confirmation, a 24-hour default expiration (up to 7 days), optional downloads, revocation, and access history. Recipients receive only the file, not saved metadata or vault access. See files.md for current behavior and limitations. Emergency access and family profiles are not included.

Verification updated in Build 47: 47 runtime integration checks passed again using temporary image and PDF fixtures. A browser suite passed 13 checks covering owner creation, separate copy buttons, account-free viewing, closing, offline hiding, access history, revocation of an open share, PDF download, reload privacy, and a same-origin phone-width iframe. Fixtures were removed. The browser login form was not verified; owner flows used an authenticated test fixture. The recipient wrong-passcode message assertion remains unverified after two attempts, although API rejection passed. Real phone and GoodBarber testing remains outstanding. Sharing is preview-only until manually deployed.

The remaining sections are the historical Build 40 review, not current status. Offline implementation progressed separately in Builds 41 to 43; consult build_state.md and offline_plan.md.

## Overview

| Field | Value |
|---|---|
| Document | Review of document sharing and offline access against the original planning |
| Prepared | Build 40 (2026-10-06), after Tracey's review feedback |
| Status | Neither feature is built. Both need scoping, a quote and a go-ahead |
| Code changes | None. This is a review only |

## Why this review

During her review Tracey asked: "I did not see document sharing or offline access, on my review am I missing something?"

She is not missing anything. Neither feature is in the app today. Offline access was part of the original requirements and the proposal, and was deferred. Document sharing came later, from the Digital Vault Architecture brief, and has been listed as "still open, needs a separate go-ahead" since Build 25.

## Summary

| | Offline access | Document sharing |
|---|---|---|
| Where it came from | Tracey's original requirements and the proposal | Digital Vault Architecture brief (8-13-2026) |
| In the proposal? | Yes: a core capability, the Phase 1 purpose and a Phase 2 bullet | No |
| What the docs say | Deferred since Build 11 (a design goal, not yet built) | Still open, separate go-ahead needed (Builds 25 and 31) |
| In the app today | Not built. The app needs a connection to open and to save | Not built. A user can only download a copy to their own phone |
| Price agreed | No separate price | None |

## 1. Offline access

### What was asked for and promised

- Tracey's original requirements (June questionnaire): "Yes, the app should work offline so users can scan and access documents without the internet." She also wrote: "Data should be securely stored on the device (and optionally encrypted)."
- Proposal (v1.0):
  - Core capabilities: "Offline-first with cloud sync".
  - Technical approach: "Offline-First: Documents save locally and sync to cloud when online - uninterrupted access regardless of signal."
  - Phase 1 purpose: "Confirm camera access, file handling, and offline storage work before committing to the full build."
  - Phase 2 (Full Feature Build, £2,000 ($2,540 USD)): "Offline-first architecture with cloud sync".
- The first versions of the feature docs planned an on-device cache of the vault structure, cached previews of recent documents, folder changes queued until back online, offline scanning with a sync status indicator, and two Settings items: clear local cache and last sync time.

### What happened

- The build went cloud-first: documents are saved straight to secure US cloud storage, and every screen loads from the server.
- In Build 11 the feature docs were brought in line with the Phase 2 code. Offline was marked deferred in scanner.md and files.md, and CUSTOM_INSTRUCTIONS.md recorded offline-first as "a design goal, not yet built". Phase 2 was recorded as complete at the same time.
- The two Settings items (clear local cache, last sync time) are still unchecked in admin.md.
- Because offline was one of the Phase 2 bullets in the proposal, Richard and Tracey should agree how it is treated (see Commercial position below).

### What the app does today

- No service worker, no on-device document cache and no upload queue. With no signal the app does not open, and a scan in progress cannot be saved.
- The nearest thing: the Download button on each document saves a copy (image or PDF) to the phone, which the user can then open without a signal from their phone's own files or photos.

### Constraints to resolve first

- The GoodBarber shell: the vault opens in GoodBarber's in-app browser. On iOS, a web page inside another company's app can only use the offline technology a web app needs (a service worker) if that app opts in through Apple's App-Bound Domains setting, which is controlled by GoodBarber, not by us. This must be confirmed with GoodBarber and tested on a real iPhone before anything is quoted.
- Sensitive data on the phone: offline copies of IDs and medical records would sit on the device. They would need to be encrypted on the device, opt-in per device ("this is my phone"), wiped on sign-out and account deletion, and still protected by the auto-lock.
- Storage that can disappear: phones and browsers can clear website storage when space is low, and Safari can clear it after a period without use. Offline copies must be treated as a convenience, with the cloud copy as the master.
- Sync conflicts: changes made offline on two devices need a clear rule for which change wins.

### Suggested scope (to be scoped and quoted)

The full delivery plan is in offline_plan.md.

- Step 0, proof of concept: a small test inside the GoodBarber app on Tracey's iPhone 14 Pro Max and one Android phone, to confirm offline storage works there at all. This decides whether the steps below are possible.
- Step 1, read-only offline vault: an opt-in "Keep documents on this phone" setting. The vault list, document names and details, and the recently viewed (or user-starred) documents are kept encrypted on the device. An offline banner shows, and the auto-lock still applies.
- Step 2, offline scanning: scans taken with no signal are kept encrypted on the device and upload automatically when the signal returns, with a "Waiting to upload" status.
- Step 3, optional: offline renames, moves and detail edits with conflict handling, plus the clear local cache and last sync time items in Settings.

## 2. Document sharing

### What was asked for

- Not in Tracey's original requirements or in the proposal. The early planning notes only listed "Possibly export or share PDFs later" as a future idea.
- Digital Vault Architecture brief (8-13-2026):
  - Executive overview: "allowing users to store, locate, update, and share critical records with less friction."
  - Principle 03, Security by Sensitivity: "High-risk records should receive stronger access controls, re-authentication, encryption, and limited exposure by default."
  - Vault 01 (Identity and IDs): "Identity records should support expiration tracking and restricted sharing."
  - Vault 06 (Legal and Estate): "Legal documents should preserve version history, execution date, and designated parties where appropriate."
  - Vault 10 (Medical and Emergency): information "that may need to be located quickly by the user or a trusted person", and "Emergency access should be deliberate, permission-based, and configurable by the user."
  - The suggested document details include "Owner / profile" and "Sharing permissions".

### Where it stands

- The brief's Phase A (vault fields, Build 25), Phase B (expiry reminders, Builds 28 to 30) and Phase C (access security, Build 31) are built.
- Sharing and multi-person profiles were recorded as not included in Build 25 and again in Build 31, each needing a separate go-ahead. No go-ahead has been given and no price exists.

### What the app does today

- Download: each document can be downloaded as an image or PDF from the app's own address. The user can then send that file from their phone (email, messages). This is manual, cannot be taken back, and leaves no record in the app.
- Data export: Settings can export a summary of the user's whole account.
- There are no share links, no shared access for another person, no trusted-person or emergency access and no record of shares.

### Suggested scope (to be scoped and quoted)

- Step 1, secure share link: a Share button on a document creates a private, view-only link that expires (for example after 24 hours or 7 days), with an optional passcode and an option to allow download. The owner can see every active link and cancel it at any time. Every open is recorded in the activity log. Creating a link from a sensitive vault asks for the password first, and masked field values are never included unless the owner chooses. The person receiving the link sees a branded page with that one document and needs no account.
- Step 2, trusted person and emergency access (Vault 10): the owner names a trusted person by email and chooses which vaults they may see. An emergency request has a waiting period (for example 48 hours) during which the owner can refuse it. Everything is logged.
- Step 3, multi-person profiles (the brief's "Owner / profile"): family members' documents under one account. This changes the data model, so it is a separate decision.

### Security notes

- A share link works for anyone who holds it, so it must be impossible to guess, short-lived and possible to cancel.
- Documents stay in the US cloud storage and are only ever served through short-lived signed addresses, as now.
- Tracey may want advice on any wording shown on the page a recipient sees, given the medical and ID content.

## Commercial position

- Offline access: one of the proposal's Phase 2 bullets (Phase 2 £2,000 ($2,540 USD)), recorded as deferred when Phase 2 was marked complete in Build 11. Richard and Tracey should agree whether it is treated as an outstanding Phase 2 item, a new separately quoted phase, or reduced or dropped in favor of the current online design. The proof of concept above should come first, because it may show that full offline use inside the GoodBarber app is not possible on iOS.
- Document sharing: came from the architecture brief after the proposal, so it is new scope, to be scoped and quoted.
- The proposal's recommended budget included a 20% contingency, £600 ($762 USD), for unforeseen work. Whether any of it remains is for Richard to confirm.

## Questions for Tracey

### Offline access

1. With no signal, what must work: viewing documents already saved, scanning new ones, or both?
2. Which documents should be kept on the phone: all of them, the most recent, or only ones the user marks "Keep offline"?
3. Given how sensitive the documents are, is keeping encrypted copies on the phone acceptable if the user turns it on for that phone only?
4. Can GoodBarber confirm whether their iOS app allows offline web storage (App-Bound Domains) for vault.lockondocs.app?

### Document sharing

5. Who receives a share: anyone with the link, or only people with their own LockonDocs account?
6. View only, or may the recipient download a copy?
7. What should the default link lifetime be?
8. Is trusted-person or emergency access (Vault 10) needed for launch, or later?
9. Are multi-person (family) profiles needed?
10. If only one can be done first, which matters more: sharing or offline?

## Recommendation

1. Neither feature affects the rest of Tracey's review, which can continue and be signed off on its own.
2. Agree the commercial treatment of offline access first.
3. Run the offline proof of concept inside the GoodBarber app before quoting offline work.
4. Start sharing with Step 1 (secure share links), which delivers the brief's "restricted sharing" and "limited exposure by default" without changing the data model.

## Build 48 sharing update (10/15/2026)

Sender-selected sharing passwords are implemented alongside generation, with a shared 12-to-64-character policy and a 72-byte hashing limit. Account confirmation remains separate, recipients still need no account, and existing passcodes remain compatible. Secure links now have a dedicated high-resolution gold-logo preview with no document information. New link/image versioning helps avoid reusing the old preview.

Verification: 70 runtime checks and 8 scoped browser checks passed. WhatsApp rendering and real-device/GoodBarber behavior remain unverified. Checkpoint only; no deployment in this build. Offline behavior was not changed.
