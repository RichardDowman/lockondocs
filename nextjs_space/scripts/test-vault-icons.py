"""Scoped creation and same-origin iframe check. Session arrives only through stdin."""
import json
import sys
from playwright.sync_api import sync_playwright, expect

fixture = json.load(sys.stdin)
base = "http://localhost:3000"
stage = "connect"
with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp("http://localhost:9222")
    context = browser.new_context(viewport={"width": 390, "height": 844})
    context.add_cookies([{"name": "next-auth.session-token", "value": fixture["session"], "url": base, "httpOnly": True, "sameSite": "Lax"}])
    page = context.new_page()
    page.set_default_timeout(20000)
    errors = []
    page.on("pageerror", lambda _: errors.append(True))
    try:
        stage = "picker catalog"
        page.goto(base + "/home")
        page.get_by_role("button", name="New", exact=True).click()
        page.get_by_role("button", name="Choose an icon").click()
        library = page.get_by_role("group", name="Vault icon library")
        expect(library.get_by_role("button")).to_have_count(40)
        for i in range(40):
            button = library.get_by_role("button").nth(i)
            button.scroll_into_view_if_needed()
            expect(button.locator("img")).to_be_visible()
            button.locator("img").evaluate("img => img.decode()")
        print("PASS: all 40 icon choices render and their images decode at phone width.", flush=True)
        stage = "search and cancel"
        page.get_by_role("textbox", name="Search icons").fill("no-match-xyz")
        expect(page.get_by_role("status")).to_contain_text("No icons found")
        page.get_by_role("textbox", name="Search icons").fill("travel")
        expect(library.get_by_role("button")).to_have_count(1)
        page.get_by_role("button", name="Travel and Visas", exact=True).click()
        expect(page.get_by_role("button", name="Choose an icon")).to_contain_text("Travel and Visas")
        page.get_by_role("button", name="Cancel", exact=True).click()
        assert len(context.request.get(base + "/api/folders").json()["folders"]) == 10
        print("PASS: search, empty results, selection and cancel add no folders.", flush=True)
        stage = "iframe create"
        page.evaluate("() => { const f = document.createElement('iframe'); f.id='icon-test-frame'; f.src='/home'; f.style.cssText='position:fixed;inset:0;width:390px;height:740px;z-index:9999;background:white'; document.body.appendChild(f); }")
        frame = page.frame_locator("#icon-test-frame")
        frame.get_by_role("button", name="New", exact=True).click()
        frame.get_by_label("Vault name", exact=True).fill("Pet records")
        frame.get_by_role("button", name="Choose an icon").click()
        frame.get_by_role("textbox", name="Search icons").fill("pets")
        frame.get_by_role("button", name="Pets", exact=True).click()
        frame.get_by_role("button", name="Create", exact=True).click()
        expect(frame.get_by_role("dialog")).to_have_count(0)
        stage = "iframe created tile"
        expect(frame.locator("button").filter(has_text="Pet records")).to_be_visible()
        print("PASS: same-origin phone-width iframe creates one custom vault with the chosen icon.", flush=True)
        stage = "reload persistence"
        page.goto(base + "/home")
        pet = page.locator("button").filter(has_text="Pet records")
        expect(pet).to_be_visible()
        pet.locator("img").evaluate("img => img.decode()")
        pet.click()
        expect(page.get_by_role("heading", name="Pet records", exact=True)).to_be_visible()
        expect(page.locator('img[alt="Pets"]')).to_be_visible()
        assert not errors
        print("PASS: chosen artwork survives reload and renders in the vault header; no uncaught page errors.", flush=True)
    except Exception as error:
        print("FAIL: " + stage + " (fixture credentials withheld)", flush=True)
        print(str(error).replace(fixture["session"], "<SESSION>")[:1400], flush=True)
        raise SystemExit(1)
    finally:
        context.close()
