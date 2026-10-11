# Offline Proof of Concept - Test Script (Step 0)

## Overview

| Field | Value |
|---|---|
| Purpose | Find out whether offline storage works inside the GoodBarber app before any offline work is quoted (Step 0 of offline_plan.md) |
| Test page | https://vault.lockondocs.app/offline-test/index.html |
| Added in | Build 41 (2026-10-06). Live only after a manual deploy |
| Data | The page holds no documents and no personal data. It saves one encrypted test sentence on the phone |
| Effect on the vault | None. It is a separate static page; its offline copy only covers /offline-test/ |
| Time | About 10 minutes per phone, plus a short check the next day |

## Before you start

1. Deploy the latest checkpoint to vault.lockondocs.app.
2. In the GoodBarber back office, add a temporary section (or a link on an existing page) that opens https://vault.lockondocs.app/offline-test/index.html, configured the same way as the live LockonDocs section. Publish the GoodBarber app update so it reaches your phones.
3. Have Wi-Fi and mobile data available, and know how to turn on Airplane Mode (with Wi-Fi off too).

## What the page shows

- A colored verdict at the top: green PASS or Ready, amber Almost or Partial, red FAIL.
- A results table: whether it is shown inside an embed, whether the internet is reachable, whether the page copy is kept on the phone, whether the encrypted record is readable, and the browser details.
- A run history, so after going offline you can see each visit with the time and internet status.
- Buttons: Open in in-app browser, Run checks again, Copy results, and Reset test.
- Since Build 42: an "Offline vault" switch at the top (off by default) that starts the home screen install, plus three extra results rows: Opened from home screen, Install prompt available, and Platform.

## The test (repeat on the iPhone and the Android phone)

### Part A - Inside the GoodBarber section (the embed)

1. With signal, open the GoodBarber app and the temporary test section.
2. Wait for the verdict. Take a screenshot (Screenshot A1).
3. Fully close the GoodBarber app (swipe it away), then open it and the test section again with signal. Expect the verdict "Ready". Take Screenshot A2.
4. Turn on Airplane Mode with Wi-Fi off. Fully close GoodBarber again.
5. Open GoodBarber and the test section with no signal. Note what happens:
   - The test page appears with PASS: take Screenshot A3.
   - GoodBarber shows its own error or a blank screen: take Screenshot A3 of that.
6. Turn the signal back on.

### Part B - In the in-app browser (how the live vault opens)

1. With signal, open the test section and tap "Open in in-app browser". The page opens in GoodBarber's browser window with a web header, the same way "Access My Vault" opens the vault.
2. Wait for the verdict, close that window, and repeat step 1 so it says "Ready". Take Screenshot B1.
3. Turn on Airplane Mode with Wi-Fi off.
4. Open GoodBarber, the test section, and tap "Open in in-app browser" again. Note what happens (the outer section may not load offline; if so, record that). Take Screenshot B2.
5. Turn the signal back on.

### Part C - Baseline in the phone's own browser

1. With signal, open https://vault.lockondocs.app/offline-test/index.html in Safari (iPhone) or Chrome (Android). Open it a second time so it says "Ready".
2. Turn on Airplane Mode and open the same address again. Take Screenshot C1.

This tells us whether a failure is caused by GoodBarber or by the phone's browser itself.

### Part D - Next day

1. After at least 24 hours (and ideally a phone restart), with Airplane Mode on, repeat Part A step 5 and Part B step 4.
2. Take Screenshots D1 and D2. Check that "Record first saved" still shows the original date and time.

### Part E - Install the offline vault (Build 42)

This is the route that does not depend on GoodBarber opening with no signal. The installed vault uses the same account and the same cloud data as the vault inside GoodBarber; only the encrypted copy kept on the phone, and one sign-in after installing, belong to that phone.

1. With signal, open the GoodBarber test section (or tap "Open in in-app browser") and switch on "Offline vault".
2. Follow the sheet that appears:
   - Samsung, inside GoodBarber: tap "Open in Chrome". Chrome opens the same page with the switch already on. Tap "Install offline vault" and confirm. If Chrome shows no install button, use the Chrome menu (three dots), then "Install app" or "Add to Home screen".
   - iPhone, inside GoodBarber: tap "Open in Safari". In Safari, tap Share, then "Add to Home Screen", then "Add".
   - If the jump to Chrome or Safari does not happen: tap "Copy link", open Chrome (Samsung) or Safari (iPhone) yourself, paste the link into the address bar, and the install sheet opens straight away. Please note which phone needed this. Take Screenshot E1 of the sheet.
3. Check that a "Vault test" icon is on the home screen. Take Screenshot E2.
4. With signal, open the vault from that icon. It should open full screen with no browser bar, and "Opened from home screen" should say Yes. Close it fully, open it again from the icon, and wait for "Ready (installed)". Take Screenshot E3.
5. Close it fully (swipe it away), turn on Airplane Mode with Wi-Fi off, and open it from the icon. Expected: "PASS: installed vault opened from the home screen with no internet." Take Screenshot E4.
6. Optional, next day: repeat step 5 after a phone restart and check that "Record first saved" still shows the original date and time. Take Screenshot E5.

## Results to send back

For each phone, send the screenshots (A1 to E5) or use "Copy results" and paste the text. Please also note:

- Phone model and iOS or Android version.
- GoodBarber app version, if shown.
- Anything GoodBarber displayed when offline (error messages, blank screens).

## How the results are read

| What you see with Airplane Mode on | What it means | Next step in offline_plan.md |
|---|---|---|
| PASS in the GoodBarber section or in the in-app browser, on both phones | Full offline is possible in that context | Steps 1 to 4 |
| PASS on Android only | iPhone is blocked, most likely by Apple's App-Bound Domains rule inside GoodBarber | Ask GoodBarber about App-Bound Domains; Plan B or Plan D for iPhone |
| GoodBarber error screen before our page loads | GoodBarber needs signal to open the section | Ask GoodBarber about an offline-capable HTML5 section (Plan D) |
| Page never says "Ready", amber "Partial" with signal | The browser stores data but cannot keep the page | Plan B (protect scans when the signal drops while the app is open) |
| Red FAIL with signal | No offline storage allowed in that context | Plan C |
| PASS in Part C only | The phone can do it, GoodBarber's browser cannot | Raise with GoodBarber before deciding |
| PASS on day 1 but the record is gone on day 2 | The phone cleared the storage | Offline is possible but copies must be treated as temporary |
| Part E PASS on both phones | The installed vault opens with no signal, whatever GoodBarber does | Build the real Offline vault switch in Settings (offline_plan.md, "Installed offline vault") |
| Part E PASS, but only after copying the link by hand | GoodBarber blocks the jump to Chrome or Safari | Keep the switch, and make its sheet lead with Copy link and the steps |
| Part E: icon added, but it opens with a browser bar or needs signal | The phone saved a bookmark rather than an installed app | Send screenshots; the install details need adjusting |
| Part E PASS on Samsung only | iPhone did not keep the page for the home screen icon | Retest on the iPhone in Safari (Part C), then decide on Plan B for iPhone |

## Cleaning up

- Tap "Reset test" on each phone and in each context you tested to clear the test data.
- Remove the temporary GoodBarber section.
- Delete the "Vault test" icon from the home screen (on iPhone, press and hold the icon, then Remove App or Delete Bookmark; on Samsung, press and hold, then Uninstall or Remove).
- The test page can be removed from the app in a later build once the results are in.
