# Reps Weekly Operations Dashboard

A small, always-on dashboard for a Samsung Galaxy Tab S2 in landscape using Fully Kiosk Browser. Four plain files; no npm, build step, frameworks, fonts, charts, Firebase SDK, service worker or backend code.

## Run locally

Serve this folder with any static HTTP server. For example, if Python is installed, run `python -m http.server 8000` here and open `http://localhost:8000`. A web server avoids inconsistent browser restrictions on `file://` URLs. Python is only an optional preview tool; the deployed dashboard needs no runtime or dependencies.

## GitHub Pages

1. Commit `index.html`, `styles.css`, `app.js` and this README to a GitHub repository.
2. In repository **Settings → Pages**, choose **Deploy from a branch**.
3. Select your branch (usually `main`) and the `/ (root)` folder, then save.
4. Open the HTTPS address GitHub provides. Relative asset paths also support repository project URLs.
5. Set that address as the start URL in Fully Kiosk Browser and use landscape/full-screen display.

The layout uses wrapping flex rows with no grid/gap requirement. It is designed for both 1280×800 and narrower landscape viewports, with portrait and phone layouts. Actual CSS viewport size depends on the tablet's display scaling and browser settings. Use the latest Android System WebView/Chrome available for the tablet; `fetch` and Promise support are required. If fetch is unavailable, the page displays a compatibility message. No claim of physical tablet testing is made.

## Data flow

Google services → Apps Script → Google Sheet → JSON endpoint → dashboard.

The public Apps Script endpoint is the `ENDPOINT` constant near the top of `app.js`. The browser only reads this aggregate JSON endpoint. No Firebase SDK is used, and browser refreshes do not directly create Firestore reads. Any upstream reads remain controlled by the Apps Script implementation.

The dashboard fetches immediately and every five minutes, updates in place, and offers **Refresh now**. `REFRESH_MS` controls the interval. Requests time out after 25 seconds. Reconnection or returning to the page also requests current data. Clock updates use the device's local time every second; metric freshness is reevaluated every 30 seconds.

## Timestamps and health

The supplied backend timestamps have no timezone. `SOURCE_UTC_OFFSET` defaults to `+10:00` (Australia/Brisbane); confirm that the Apps Script project's timezone matches. Change this constant if necessary. Explicitly zoned ISO timestamps are respected. The visible clock and displayed timestamps always use the browser's timezone. Keep the tablet's automatic date/time enabled.

`STALE_MS` is 90 minutes and `CRITICAL_MS` is three hours. Exactly 90 minutes is fresh; exactly three hours is stale, not critical. Each metric uses `last_success`; API status `ERROR` overrides freshness. Unknown timestamps, missing values and unknown statuses cannot be healthy. Overall freshness uses the `dashboard_last_run` value, falling back to the newest metric success timestamp if it is unavailable. All returned metrics, including Android/iOS today values not shown as cards, participate in health checks.

Badge priority: **ERROR → ACTION REQUIRED → WARNING → HEALTHY**. Fetch failures count as ERROR. Positive helpdesk/deletion counts still trigger ACTION REQUIRED even when their values are stale; individual cards clearly report that staleness. A backend freshness banner remains visible alongside higher-priority health badges.

## Offline and error handling

Each valid JSON response and the successful browser-fetch time are saved in localStorage. Saved values render immediately on startup before the live fetch. Failed network requests, invalid JSON and `ok:false` leave the previous data visible and show an error banner. Missing individual values display an em dash; zero remains `0`; revenue always displays dollars to two decimals. Metric errors are available in card title tooltips and are inserted as text, never HTML.

If storage is disabled or full, live updates continue and the system footer reports that caching is unavailable. Invalid cached JSON is ignored. Caching stores data, not the page assets: after closing the browser, opening the page from a completely offline device is not guaranteed. Keep the kiosk page open during temporary Wi-Fi outages.

Only the supplied aggregate response is used. Do not expand the public endpoint with personal details or secrets. The dashboard does not require credentials.
