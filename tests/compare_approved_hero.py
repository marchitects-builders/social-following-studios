"""Compare the approved hero (836e44a) with the current recovery build."""

from pathlib import Path
from playwright.sync_api import sync_playwright

APPROVED = "http://127.0.0.1:3008"
CURRENT = "http://127.0.0.1:3007"
OUT = Path("artifacts/visual-qa/approved-comparison")
OUT.mkdir(parents=True, exist_ok=True)


def assert_dashboard(page, url):
    page.goto(url, wait_until="networkidle")
    dashboard = page.locator('[aria-label="Assessment summary"]')
    assert dashboard.is_visible(), url
    content = dashboard.inner_text()
    for value in ("Ready to Reactivate", "83%", "246K", "$3.8M", "78%"):
        assert value in content, (url, value)
    return dashboard


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    for name, width, height in [("desktop", 1440, 900), ("tablet", 768, 1024), ("mobile", 390, 844)]:
        approved = browser.new_page(viewport={"width": width, "height": height}, reduced_motion="reduce")
        current = browser.new_page(viewport={"width": width, "height": height}, reduced_motion="reduce")
        assert_dashboard(approved, APPROVED)
        assert_dashboard(current, CURRENT)
        approved.screenshot(path=str(OUT / f"approved-{name}.png"), full_page=True)
        current.screenshot(path=str(OUT / f"current-{name}.png"), full_page=True)
        approved.close()
        current.close()

    comparison = browser.new_page(viewport={"width": 1440, "height": 900})
    comparison.set_content(
        f'''<style>html,body{{margin:0;height:100%;background:#e9e4d9}}main{{display:grid;grid-template-columns:1fr 1fr;gap:12px;height:100%;padding:12px;box-sizing:border-box}}section{{display:grid;grid-template-rows:auto 1fr;gap:8px;font:600 14px system-ui;color:#24221d}}iframe{{width:100%;height:100%;border:1px solid #cfc8ba;background:#fff}}</style><main><section>Approved build — 836e44a<iframe src="{APPROVED}"></iframe></section><section>Current recovery build<iframe src="{CURRENT}"></iframe></section></main>'''
    )
    comparison.locator("iframe").nth(1).wait_for()
    comparison.wait_for_timeout(1200)
    comparison.screenshot(path=str(OUT / "hero-side-by-side.png"))
    comparison.close()
    browser.close()

print("Approved/current hero comparison passed; captures in artifacts/visual-qa/approved-comparison")
