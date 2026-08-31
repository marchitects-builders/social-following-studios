"""
Browser Use smoke test — no LLM/agent involved. Copy of the script used to
verify the `browser-use-local` install (see STACK_STATUS.md). This is our
own test script, not part of the browser-use project itself, so it's kept
here for reproducibility.

Run with the browser-use-local venv, e.g.:
    /home/user/browser-use-local/.venv/bin/python browser-use-smoke-test.py

Verifies:
  - package imports
  - browser launches (reusing the Chromium already installed for Crawlee/Playwright)
  - a public URL opens
  - page elements can be inspected
  - browser exits cleanly

Does not use browser_use.Agent (that requires an LLM). This exercises the
lower-level BrowserSession API directly.
"""

import asyncio
import os

from browser_use.browser import BrowserProfile, BrowserSession

CHROMIUM_PATH = os.environ.get("PLAYWRIGHT_CHROMIUM_PATH", "/opt/pw-browsers/chromium")
TARGET_URL = os.environ.get("TEST_URL", "https://pypi.org/")
# Only needed behind a TLS-intercepting proxy (e.g. this sandbox's outbound
# proxy); leave unset on a normal machine.
IGNORE_HTTPS_ERRORS = os.environ.get("PLAYWRIGHT_IGNORE_HTTPS_ERRORS") == "1"


async def main():
    extra_args = ["--ignore-certificate-errors"] if IGNORE_HTTPS_ERRORS else []
    profile = BrowserProfile(
        executable_path=CHROMIUM_PATH,
        headless=True,
        is_local=True,
        user_data_dir=None,  # ephemeral profile, nothing persisted
        # Some containers run Chromium as root without a working setuid
        # sandbox helper; Chrome refuses to start as root unless sandboxing
        # is explicitly disabled (see https://crbug.com/638180). Playwright
        # does this automatically when it detects root; browser-use's
        # official `chromium_sandbox` field is the documented way to do the
        # same for a direct/local launch. Leave at the library default
        # (True) on a normal, non-root machine.
        chromium_sandbox=False,
        args=extra_args,
    )
    session = BrowserSession(browser_profile=profile)

    print("[1/5] Starting browser session (launching Chromium)...")
    await session.start()
    print("    OK: browser launched, executable =", CHROMIUM_PATH)

    try:
        print(f"[2/5] Navigating to {TARGET_URL} ...")
        await session.navigate_to(TARGET_URL)
        print("    OK: navigation complete")

        title = await session.get_current_page_title()
        url = await session.get_current_page_url()
        print(f"[3/5] Page title: {title!r}, url: {url!r}")

        print("[4/5] Inspecting page elements (DOM/state summary)...")
        state = await session.get_browser_state_summary()
        element_count = len(state.dom_state.selector_map) if state and state.dom_state else 0
        print(f"    OK: found {element_count} interactive elements")

        result = {"title": title, "url": url, "element_count": element_count}
    finally:
        print("[5/5] Closing browser session...")
        await session.kill()
        print("    OK: browser exited cleanly")

    return result


if __name__ == "__main__":
    result = asyncio.run(main())
    print("\nSMOKE TEST RESULT:", result)
