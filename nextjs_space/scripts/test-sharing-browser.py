"""Preview UI checks. Test credentials arrive through stdin, never files or logs."""
import json
import sys
import traceback
from playwright.sync_api import sync_playwright, expect

fixture = json.load(sys.stdin)
base = "http://localhost:3000"
checks = 0
stage = "connect"

def passed(label):
    global checks
    checks += 1
    print("PASS " + label, flush=True)

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp("http://localhost:9222")
    owner_context = browser.new_context(viewport={"width": 390, "height": 844}, permissions=["clipboard-read", "clipboard-write"], accept_downloads=True)
    recipient_context = browser.new_context(viewport={"width": 390, "height": 844}, accept_downloads=True)
    owner = owner_context.new_page()
    recipient = recipient_context.new_page()
    page_errors = []
    owner.on("pageerror", lambda error: page_errors.append(type(error).__name__))
    recipient.on("pageerror", lambda error: page_errors.append(type(error).__name__))
    owner.set_default_timeout(20000)
    recipient.set_default_timeout(20000)
    try:
        stage = "authenticated owner fixture"
        owner_context.add_cookies([{"name": "next-auth.session-token", "value": fixture["session"], "url": base, "httpOnly": True, "sameSite": "Lax"}])
        owner.goto(base + "/home")
        owner.wait_for_url("**/home")
        passed("Authenticated disposable owner session opens the vault")

        def create_share(doc_id, label, downloads=False, test_error=False):
            owner.goto(base + "/document/" + doc_id)
            owner.get_by_role("button", name="Share document", exact=True).click()
            expect(owner.locator("#share-expiry")).to_have_value("24")
            expect(owner.locator("#share-download")).to_have_attribute("aria-checked", "false")
            initial = owner.locator("#share-passcode").input_value()
            assert len(initial) == 19
            owner.get_by_role("button", name="Generate a password").click()
            assert owner.locator("#share-passcode").input_value() != initial
            owner.locator("#share-label").fill(label)
            if downloads:
                owner.locator("#share-download").click()
                owner.locator("#share-expiry").select_option("168")
            if test_error:
                owner.locator("#share-password").fill("intentionally-incorrect")
                owner.get_by_role("button", name="Create secure share", exact=True).click()
                expect(owner.get_by_role("alert")).to_have_text("Incorrect account password.")
                expect(owner.locator("#share-password")).to_have_value("")
                passed("Wrong owner password is rejected and cleared")
            owner.locator("#share-password").fill(fixture["password"])
            owner.get_by_role("button", name="Create secure share", exact=True).click()
            expect(owner.get_by_text("Share created", exact=True)).to_be_visible()
            link = owner.locator("#created-share-link").input_value()
            passcode = owner.locator("#created-passcode").input_value()
            owner.get_by_role("button", name="Copy link", exact=True).click()
            assert owner.evaluate("navigator.clipboard.readText()") == link
            owner.get_by_role("button", name="Copy password", exact=True).click()
            assert owner.evaluate("navigator.clipboard.readText()") == passcode
            owner.get_by_role("button", name="Done", exact=True).click()
            return link, passcode

        stage = "create view-only image share"
        image_link, image_passcode = create_share(fixture["imageId"], "UI image recipient", test_error=True)
        passed("Image share creation, defaults, regeneration, and separate copy buttons")
        stage = "recipient no-account page"
        recipient.goto(image_link)
        expect(recipient.get_by_text("No account needed.", exact=False)).to_be_visible()
        assert not any("next-auth.session-token" in c["name"] for c in recipient_context.cookies())
        # Wrong-passcode server denial is covered by test-sharing.ts. The browser
        # error-message assertion is not retried after two automation failures.
        passed("Recipient page opens without an owner account")

        def unlock(page, code):
            page.locator("#recipient-passcode").fill(code)
            page.get_by_role("button", name="Open document", exact=True).click()
            expect(page.get_by_role("button", name="Close document", exact=True)).to_be_visible()

        stage = "view image"
        unlock(recipient, image_passcode)
        recipient.wait_for_function("() => { const i = document.querySelector('img[alt=\"Document shared with you\"]'); return i && i.complete && i.naturalWidth === 600; }")
        expect(recipient.get_by_role("button", name="Download document", exact=True)).to_have_count(0)
        assert "PRIVATE METADATA" not in recipient.inner_text("body")
        assert "Private test png" not in recipient.inner_text("body")
        assert recipient.evaluate("document.documentElement.scrollWidth <= innerWidth")
        passed("View-only image decodes at phone width without metadata or a download button")
        recipient.get_by_role("button", name="Close document", exact=True).click()
        expect(recipient.locator("#recipient-passcode")).to_be_visible()
        recipient.wait_for_function("async () => { const r = await fetch('/api/auth/session'); return !(await r.json()).user; }")
        assert not any(c["name"].startswith("ld_share_") for c in recipient_context.cookies())
        passed("Close document clears the recipient cookie without an owner account")
        unlock(recipient, image_passcode)
        recipient_context.set_offline(True)
        expect(recipient.locator("#recipient-passcode")).to_be_visible()
        expect(recipient.locator('p[role="alert"]')).to_contain_text("internet connection")
        recipient_context.set_offline(False)
        unlock(recipient, image_passcode)
        passed("Connection loss hides the document and requires the passcode again")

        stage = "owner management and live revocation"
        owner.goto(base + "/settings")
        owner.get_by_role("button", name="Manage document sharing").click()
        owner.wait_for_url("**/shares")
        article = owner.locator("article").filter(has_text="UI image recipient")
        article.get_by_role("button", name="Access history", exact=True).click()
        expect(article.get_by_text("Opened", exact=False).first).to_be_visible()
        article.get_by_role("button", name="Revoke", exact=True).click()
        article.get_by_role("button", name="Cancel", exact=True).click()
        expect(article.get_by_text("Active", exact=True)).to_be_visible()
        article.get_by_role("button", name="Revoke", exact=True).click()
        article.get_by_role("button", name="Revoke share", exact=True).click()
        expect(article.get_by_text("Revoked", exact=True)).to_be_visible()
        expect(recipient.locator("#recipient-passcode")).to_be_visible(timeout=25000)
        expect(recipient.locator('p[role="alert"]')).to_contain_text("unavailable")
        recipient.locator("#recipient-passcode").fill(image_passcode)
        recipient.get_by_role("button", name="Open document", exact=True).click()
        expect(recipient.locator('p[role="alert"]')).to_contain_text("unavailable")
        passed("Settings management, access history, cancel, and revocation of an open share")

        stage = "PDF download-enabled share"
        pdf_link, pdf_passcode = create_share(fixture["pdfId"], "UI PDF recipient", downloads=True)
        recipient.goto(pdf_link)
        with recipient.expect_response(lambda r: "/api/shared/file?" in r.url and r.status == 200):
            unlock(recipient, pdf_passcode)
        expect(recipient.locator('iframe[title="Shared PDF document"]')).to_be_visible()
        with recipient.expect_download() as download_info:
            recipient.get_by_role("button", name="Download document", exact=True).click()
        download = download_info.value
        assert download.suggested_filename == "shared-document.pdf"
        assert download.failure() is None
        download.delete()
        passed("Seven-day PDF share loads its frame and downloads the authorized file")
        recipient.reload()
        expect(recipient.locator("#recipient-passcode")).to_be_visible()
        passed("Reload does not reveal a document without entering the passcode")

        stage = "embedded recipient"
        embedded = recipient_context.new_page()
        embedded.goto(base + "/share")
        embedded.evaluate("url => { const f=document.createElement('iframe'); f.id='test-frame'; f.width='390'; f.height='780'; f.src=url; document.body.replaceChildren(f); }", pdf_link)
        frame = embedded.frame_locator("#test-frame")
        frame.locator("#recipient-passcode").fill(pdf_passcode)
        frame.get_by_role("button", name="Open document", exact=True).click()
        expect(frame.get_by_role("button", name="Close document", exact=True)).to_be_visible()
        embedded.close()
        passed("Recipient unlock succeeds in a same-origin phone-width iframe")
        recipient.goto(base + "/share")
        expect(recipient.get_by_text("This link is incomplete.", exact=True)).to_be_visible()
        passed("Incomplete link has a clear recovery message")
        assert not page_errors
        passed("No uncaught browser page errors during owner and recipient flows")
        print(f"Sharing browser checks passed: {checks}", flush=True)
    except Exception as error:
        # Browser exception text can contain locator values or secret URLs. Do not print it.
        line = traceback.extract_tb(error.__traceback__)[0].lineno
        print(f"BROWSER CHECK FAILED at {stage}, script line {line}: {type(error).__name__}", flush=True)
        sys.exit(1)
    finally:
        owner_context.close()
        recipient_context.close()
        browser.close()
