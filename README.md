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

## Operations, Analytics and More Activity

The Action Required row contains four operational counts: Helpdesk Unread (`helpdesk_unread`), Deletion Requests (`deletion_requests`), Bug Reports (`bug_reports`) and Player Reports (`player_reports`). A fresh zero is Clear; any fresh positive count requires action. Any positive operational count triggers the overall ACTION REQUIRED badge unless an ERROR has higher priority. Bug Reports and Player Reports count currently existing Firestore report documents because actioned reports are manually deleted.

The permanent Usage row is deliberately limited to Active Users Today, Workouts Today, Active Users 30d and Top App Version.

The **More Activity** button opens an internally scrolling dialog with these already-fetched metrics:

- General Usage: Sessions Today, First Opens Today, First Opens 7d, Active Users 7d, Workouts 7d and Workouts 30d.
- Interval Timer: started and completed counts for today and 7 days.
- Teams: Joined Today and Joined 7d.
- App Health / Analytics: App Exceptions 7d.
- Platform: Android and iOS users for today and 30 days.

Close it with Close, the backdrop, or Escape. Keyboard focus stays in the dialog and returns to the opening button. Opening it makes no API call: it uses the most recently fetched or cached JSON and continues updating when normal refreshes complete. All metrics reuse the existing missing-value, error and freshness rules, including numeric zero. Missing displayed metrics also contribute a warning to system health.

Analytics `first_open` means the first app open after installing or reinstalling. It is not an account registration count.

Crashlytics is intentionally absent. Although Firebase BigQuery datasets exist, the export currently has no usable crash tables or data, so displaying zero crashes would be misleading.

## AMOLED pixel shift

The complete main dashboard content shifts instantly by at most 3 CSS pixels every ten minutes, cycling through (0,0), (3,0), (3,3), (0,3), (-3,3), (-3,0), (-3,-3), (0,-3), (3,-3), then repeating. There is no continuous animation or transition. The index is held only in JavaScript and starts over on reload. The separate five-minute data refresh never resets it.

Change PIXEL_SHIFT_MS and PIXEL_SHIFT_OFFSETS near the top of app.js to adjust the interval and offsets. Keep offsets within 3–5 pixels and smaller than the main padding. The transform applies to an inner content wrapper, leaving the padding as movement clearance without changing layout dimensions. The fixed dialog sits outside this transformed wrapper, so its backdrop, scrolling and touch targets remain correct. This is subtle mitigation, not a guarantee against burn-in.
