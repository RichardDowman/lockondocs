"""Build 48 scoped preview checks. Never log passwords, cookies, or capability links."""
import json
import secrets
import sys
from playwright.sync_api import sync_playwright, expect

fixture = json.load(sys.stdin)
base = "http://localhost:3000"
stage = "connect"
checks = 0

def passed(label):
    global checks
    checks += 1
    print("PASS " + label, flush=True)

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp("http://localhost:9222")
    owner_context = browser.new_context(viewport={"width": 390, "height": 844}, permissions=["clipboard-read", "clipboard-write"])
    recipient_context = browser.new_context(viewport={"width": 390, "height": 844})
    owner = owner_context.new_page()
    recipient = recipient_context.new_page()
    errors = []
    owner.on("pageerror", lambda _: errors.append(True))
    recipient.on("pageerror", lambda _: errors.append(True))
    owner.set_default_timeout(20000)
    recipient.set_default_timeout(20000)
    try:
        stage = "share preview metadata"
        recipient.goto(base + "/share?v=48")
        assert recipient.locator('meta[property="og:image"]').get_attribute("content").endswith("/share-preview-v48.png")
        assert recipient.locator('meta[property="og:image:width"]').get_attribute("content") == "1200"
        assert "Secure document sharing" in recipient.locator('meta[property="og:title"]').get_attribute("content")
        assert "No account needed" in recipient.locator('meta[property="og:description"]').get_attribute("content")
        passed("Public share metadata uses the new branded image and private generic text")
        recipient.goto(base + "/share-preview-v48.png")
        recipient.wait_for_function("() => document.images[0]?.complete && document.images[0].naturalWidth === 1200 && document.images[0].naturalHeight === 1200")
        passed("New preview image is publicly delivered and decodes at 1200 by 1200")

        stage = "custom password form"
        owner_context.add_cookies([{"name": "next-auth.session-token", "value": fixture["session"], "url": base, "httpOnly": True, "sameSite": "Lax"}])
        owner.goto(base + "/document/" + fixture["imageId"])
        owner.get_by_role("button", name="Share document", exact=True).click()
        field = owner.locator("#share-passcode")
        expect(field).to_be_editable()
        initial = field.input_value()
        owner.get_by_role("button", name="Generate a password", exact=True).click()
        assert len(field.input_value()) == 19 and field.input_value() != initial
        passed("Sharing password is editable and generation remains available")
        field.fill("short")
        owner.locator("#share-password").fill(fixture["password"])
        owner.get_by_role("button", name="Create secure share", exact=True).click()
        expect(owner.locator('p[role="alert"]')).to_contain_text("12 to 64")
        passed("Form rejects a short custom password")
        custom = "Café " + secrets.token_hex(8) + " !?"
        field.fill(custom)
        owner.get_by_role("button", name="Create secure share", exact=True).click()
        expect(owner.get_by_text("Share created", exact=True)).to_be_visible()
        assert owner.locator("#created-passcode").input_value() == custom
        link = owner.locator("#created-share-link").input_value()
        assert "/share?v=48#" in link
        owner.get_by_role("button", name="Copy password", exact=True).click()
        assert owner.evaluate("navigator.clipboard.readText()") == custom
        owner.get_by_role("button", name="Copy link", exact=True).click()
        assert owner.evaluate("navigator.clipboard.readText()") == link
        passed("Chosen password survives creation and copies separately from the versioned link")

        stage = "recipient custom password"
        recipient.goto(link)
        expect(recipient.get_by_text("No account needed.", exact=False)).to_be_visible()
        recipient.locator("#recipient-passcode").fill(custom)
        recipient.get_by_role("button", name="Open document", exact=True).click()
        expect(recipient.get_by_role("button", name="Close document", exact=True)).to_be_visible()
        recipient.wait_for_function("() => { const i = document.querySelector('img[alt=\"Document shared with you\"]'); return i?.complete && i.naturalWidth === 600; }")
        assert not any("next-auth.session-token" in c["name"] for c in recipient_context.cookies())
        passed("Chosen password opens actual document bytes without an account")

        stage = "same-origin iframe custom password"
        recipient.goto(base + "/share")
        recipient.evaluate("url => { const f = document.createElement('iframe'); f.id = 'test-share-frame'; f.src = url; f.style.width = '390px'; f.style.height = '700px'; document.body.appendChild(f); }", link)
        frame = recipient.frame_locator("#test-share-frame")
        frame.locator("#recipient-passcode").fill(custom)
        frame.get_by_role("button", name="Open document", exact=True).click()
        expect(frame.get_by_role("button", name="Close document", exact=True)).to_be_visible()
        passed("Custom password also unlocks in a same-origin phone-width iframe")
        assert not errors
        passed("No uncaught browser errors in the scoped flows")
        print(f"Build 48 browser checks passed: {checks}", flush=True)
    except Exception:
        print("FAIL stage: " + stage + " (details withheld to protect fixture secrets)", flush=True)
        sys.exit(1)
    finally:
        owner_context.close()
        recipient_context.close()
