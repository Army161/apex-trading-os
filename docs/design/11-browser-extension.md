# 11. Browser extension

A small extension that sends what the user is looking at to the claim checker. App: `apps/extension`. Phase 5, after the web claim checker works. It serves both personal Apex and the product; the only difference is the base URL and the sign-in.

## 1. What it does

On a YouTube video page or a TradingView script page, the user clicks the extension button (or a small "Check this claim" button the extension adds near the title). The extension collects the text, shows what it is about to send, and on confirmation starts a claim check. The verdict appears in the side panel with a link to the full result.

It does nothing until the user clicks. It does not read pages in the background, track browsing, or change any page beyond adding its one button.

## 2. Sources

| Page | What is collected | How | Fallback |
|---|---|---|---|
| YouTube watch page | Title, channel name, the transcript text, the video URL as a label | Reads the transcript panel the page itself shows when the user opens "Show transcript". The extension can open that panel on click | "No transcript on this video. Paste the text instead." |
| TradingView script page | Script title, author, the Pine source if the script is open-source and shown on the page, the description | Reads the visible source block | For closed-source scripts: description only, and the check will most likely be `untestable` |
| Any other page | The user's text selection | Context menu "Check selected text with Apex" | Paste box in the side panel |

Terms note: reading a transcript that the site displays to the signed-in user, on that user's click, for that user's own analysis is the narrowest possible use, but each site's terms govern automated access. Before the product ships publicly the extension's behaviour on each site gets a terms review (`12` section 9). If a site's terms do not allow it, that site falls back to "paste the text", which always works.

## 3. Architecture

Manifest V3.

```
apps/extension/
  manifest.json
  src/background.ts          service worker: API calls, auth token storage, context menu
  src/content/youtube.ts     adds the button, extracts transcript on request
  src/content/tradingview.ts adds the button, extracts source on request
  src/panel/                 side panel UI (React, packages/ui tokens)
  src/options/               base URL, key or sign-in, privacy notes
```

- **Permissions**: `activeTab`, `sidePanel`, `storage`, `contextMenus`, `scripting`. Host permissions only for `https://www.youtube.com/*`, `https://www.tradingview.com/*` and the configured Apex or product origin. No `<all_urls>`, no `tabs`, no `webRequest`, no history.
- **Flow**: content script extracts on request and passes text to the service worker; the panel shows a preview (first 500 characters, total length, what will be sent); on confirm the worker calls `POST /v1/claim-checks` with an idempotency key (hash of URL and text) and polls until done.
- **Auth, personal Apex**: an API key with scopes `queue:claims` and `read:status`, pasted once into Options, stored in `chrome.storage.local` (not `sync`).
- **Auth, product**: OAuth sign-in with PKCE through `chrome.identity.launchWebAuthFlow`; short-lived access token and refresh token in `chrome.storage.session` and `local` respectively.
- All extracted text is treated as untrusted by the server (it already is: `05` section 3). The extension never renders page HTML in its own UI; it shows plain text only.
- No remote code. Everything is bundled.

## 4. Side panel

```
┌ Apex claim check ──────────────────────────┐
│ Turtle Breakout 55/20 | channel name       │
│ Transcript found · 18,240 characters       │
│ [preview of the first lines…]              │
│                                            │
│ This will use up to 3 tries.               │
│ [ Check this claim ]      [ Edit text ]    │
├────────────────────────────────────────────┤
│ Extracting rules…                          │
├────────────────────────────────────────────┤
│ NO EDGE                                    │
│ On BTC daily bars, these rules did not     │
│ beat random entries, costs and buy and     │
│ hold.                                      │
│ Claimed +729%  ·  Measured −1.5% (n = 7)   │
│ [ Open the full result ]                   │
└────────────────────────────────────────────┘
```

States: not signed in, no text found, quota or trial budget reached, server unreachable, check failed. History of the last 20 checks from this browser, with links.

## 5. Privacy

- Sent to the server: the text, the page title, the page URL as a label. Nothing else.
- Not collected: browsing history, other tabs, cookies, the user's YouTube or TradingView identity.
- The options page states this in plain words and links to the privacy policy.

## 6. Distribution

- Personal: loaded unpacked from the repo build, or a private listing.
- Product: Chrome Web Store first; Firefox and Edge after. The store listing describes it as a research tool, makes no performance claims, and carries the "not investment advice" line.

## 7. Tests

- Extraction against saved page fixtures for both sites, including a video with no transcript and a closed-source script.
- The panel shows the preview before any network call (a test asserts no request is made before confirm).
- Permission lint: the manifest matches the list above exactly.
- End to end with Playwright and a loaded extension against a local fixture page and a mocked API.
