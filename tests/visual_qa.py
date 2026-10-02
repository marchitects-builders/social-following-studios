"""Local visual and route gate. Run with: python tests/visual_qa.py"""

import os
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = os.getenv("BASE", "http://127.0.0.1:3007")
OUT = Path("artifacts/visual-qa")
OUT.mkdir(parents=True, exist_ok=True)
ROUTES = [
    ("/", "Own your audience."),
    ("/what-we-do", "What we do"),
    ("/audience-builder", "Audience Builder"),
    ("/case-studies", "Proof"),
    ("/assessment", "Book your assessment."),
    ("/contact", "Contact"),
    ("/avatar-studio", "Avatar Studio"),
    ("/terms", "Terms"),
    ("/privacy", "Privacy"),
    ("/thank-you", "Request received"),
    ("/full-service-esp", "Software gives you access"),
    ("/industries", "Built for regulated"),
    ("/results", "Verified case studies"),
    ("/insights", "Operational knowledge"),
    ("/about", "execution layer"),
]


def check(page, name):
    page.goto(BASE + "/", wait_until="networkidle")
    page.locator(".hero-title").wait_for()
    assert "Own your" in page.locator(".hero-title").inner_text()
    for label in ("What We Do", "Full-Service ESP", "Industries", "Results", "Insights", "About"):
        assert label in page.locator(".nav").inner_text()
    dashboard = page.locator(".hero-assessment-card")
    assert dashboard.is_visible()
    assert "Ready to Reactivate" in dashboard.inner_text()
    assert "83%" in dashboard.inner_text()
    assert "246K" in dashboard.inner_text()
    assert "$3.8M" in dashboard.inner_text()
    assert "Infrastructure in place. Channels connected. Ready to deploy." in dashboard.inner_text()
    assert page.locator(".audience-graph").count() == 0
    assert page.locator(".home-route-index").count() == 0
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 2"), f"overflow on {name}"
    page.screenshot(path=str(OUT / f"home-{name}.png"), full_page=True)
    for route, expected in ROUTES[1:]:
        response = page.goto(BASE + route, wait_until="networkidle")
        assert response.status == 200, (route, response.status)
        assert expected.lower() in page.locator("body").inner_text().lower(), route
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 2"), f"overflow on {route} at {name}"
    page.goto(BASE + "/audience-builder", wait_until="networkidle")
    graph = page.locator(".audience-graph")
    graph.scroll_into_view_if_needed()
    assert graph.is_visible()
    assert graph.locator("path").count() >= 8
    assert graph.locator("circle").count() >= 6
    assert "Your audience is your business’s greatest asset." in page.locator("body").inner_text()
    page.screenshot(path=str(OUT / f"audience-builder-{name}.png"), full_page=True)
    page.goto(BASE + "/assessment", wait_until="networkidle")
    assert page.locator(".assessment-summary").is_visible()
    assert page.locator(".assessment-summary .index-list li").count() == 5
    page.screenshot(path=str(OUT / f"assessment-{name}.png"), full_page=True)
    assert page.goto(BASE + "/yochat", wait_until="networkidle").status == 404
    if name == "mobile":
        page.goto(BASE + "/", wait_until="networkidle")
        page.locator(".menu-toggle").click()
        assert page.locator(".mobile-nav").is_visible()
        assert page.locator(".menu-toggle").get_attribute("aria-expanded") == "true"
        page.screenshot(path=str(OUT / "mobile-menu.png"))
        page.keyboard.press("Escape")
        page.locator(".mobile-nav").wait_for(state="hidden")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    for name, width, height in [("desktop", 1440, 900), ("tablet", 768, 1024), ("mobile", 390, 844)]:
        page = browser.new_page(viewport={"width": width, "height": height}, reduced_motion="reduce")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        check(page, name)
        assert not errors, (name, errors)
        page.close()
    motion_page = browser.new_page(viewport={"width": 1440, "height": 900}, reduced_motion="no-preference")
    motion_errors = []
    motion_page.on("pageerror", lambda error: motion_errors.append(str(error)))
    motion_page.goto(BASE + "/audience-builder", wait_until="domcontentloaded")
    graph = motion_page.locator(".audience-graph")
    graph.scroll_into_view_if_needed()
    animated_edge = graph.locator("path").nth(1)
    before = animated_edge.get_attribute("stroke-dasharray")
    motion_page.wait_for_timeout(1800)
    assert graph.locator("path").count() >= 8
    after = animated_edge.get_attribute("stroke-dasharray")
    assert before != after and after == "1 1", (before, after)
    assert not motion_errors, motion_errors
    motion_page.close()
    browser.close()
print("Visual QA passed; screenshots in artifacts/visual-qa")
