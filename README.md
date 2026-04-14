# Mesh Health Check

Mesh Health Check is a self-hosted web app that measures MeshCore message
coverage across your MQTT-connected observer network. It gives the user a short
code, waits for that code to appear in the configured MeshCore group channel,
then scores the result based on how many selected observers reported the same
message hash.

The idea for this app came from Nick D from Boston.

Other community Health Checks:

- https://healthcheck.ukmesh.com/ - UK Mesh Health Check

![Coverage example 1](image1.png)
![Coverage example 2](image2.png)
![Coverage example 3](image3.png)

## Features

- short-lived reusable test codes with expiry and per-code use limits
- observer-by-observer receipt tracking with path, RSSI, SNR, and duration data
- observer timeline view showing when each observer first saw the message
- observer coverage map with dark/light basemap toggle
- shareable result links backed by retained server-side session storage
- installable browser app support via manifest + service worker
- default observer target sets plus browser-side custom observer selection
- persistent observer profiles through
  [observer.json](/home/yellowcooln/mesh-health-check/observer.json)
- MQTT-learned observer locations saved back into `observer.json`
- Cloudflare Turnstile landing page for bot protection
- optional external hero link driven by env
- Docker-first deployment behind Nginx or Cloudflare
- fixture, API, and smoke-test coverage in CI

## How It Works

1. A visitor opens the site and gets a code such as `MHC-AB12CD`.
2. The user sends that code to the configured MeshCore channel.
3. The backend watches the MQTT observer feed for that channel only.
4. When the matching `GroupText` message appears, the app ties all receipts for
   the same message hash to that code.
5. The UI computes coverage against either the default observer set or the
   user’s custom selection for that code.

Each code:
- expires after `SESSION_TTL_SECONDS`
- can be used up to `MAX_USES_PER_CODE` times
- keeps browser history local to the current browser session
- keeps shareable results on the server until `RESULT_RETENTION_SECONDS`

## Project Layout

- [server.js](/home/yellowcooln/mesh-health-check/server.js): Express app,
  MQTT ingest, session matching, observer persistence, Turnstile verification,
  WebSocket updates
- [public/](/home/yellowcooln/mesh-health-check/public): dashboard, landing
  page, browser logic, service worker, and styles
- [data/observer.json](/home/yellowcooln/mesh-health-check/data/observer.json):
  persistent observer public-key profile map with `name`, `lat`, and `lon`
- [data/session-results.json](/home/yellowcooln/mesh-health-check/data/session-results.json):
  retained session result store for shareable links
- [`.env.example`](/home/yellowcooln/mesh-health-check/.env.example): deployment
  config template
- [HOWTO.md](/home/yellowcooln/mesh-health-check/HOWTO.md): setup and operator
  guide

This repo is container-first. `docker compose up -d --build` is the intended
runtime path.

## Environment

Copy [`.env.example`](/home/yellowcooln/mesh-health-check/.env.example) to
[`.env`](/home/yellowcooln/mesh-health-check/.env) and fill in the values you
actually need.

Key groups:

- App:
  `PORT`, `APP_TITLE`, `APP_EYEBROW`, `APP_HEADLINE`, `APP_DESCRIPTION`,
  `EXTERNAL_LINK_URL`, `EXTERNAL_LINK_LABEL`, `LOG_LEVEL`, `TRUST_PROXY`
- MQTT:
  `MQTT_HOST`, `MQTT_PORT`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_TOPIC`,
  `MQTT_TRANSPORT`, `MQTT_WS_PATH`, `MQTT_TLS`, `DASH_BROKER_HOST`, optional
  `MQTT_URL`
- Channel:
  `TEST_CHANNEL_NAME`, `TEST_CHANNEL_SECRET`, optional `TEST_CHANNEL_HASH`
- Sessions:
  `SESSION_TTL_SECONDS`, `RESULT_RETENTION_SECONDS`, `MAX_USES_PER_CODE`,
  `SESSION_RATE_WINDOW_SECONDS`, `SESSION_RATE_MAX`
- Observers:
  `OBSERVERS_FILE`, `RESULTS_FILE`, `KNOWN_OBSERVERS`,
  `OBSERVER_ACTIVE_WINDOW_SECONDS`, `OBSERVER_RETENTION_SECONDS`
- Turnstile:
  `TURNSTILE_ENABLED`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`,
  `TURNSTILE_API_URL`, `TURNSTILE_COOKIE_NAME`,
  `TURNSTILE_TOKEN_TTL_SECONDS`, `TURNSTILE_BOT_BYPASS`,
  `TURNSTILE_BOT_ALLOWLIST`, `TURNSTILE_VERIFY_RATE_WINDOW_SECONDS`,
  `TURNSTILE_VERIFY_RATE_MAX`

Important behavior:

- If `KNOWN_OBSERVERS` is set, new codes use that configured observer set by
  default.
- If `KNOWN_OBSERVERS` is blank, the default target falls back to observers
  active in the configured time window.
- Observers fall out of the dashboard directory and map if they have not been
  heard from within `OBSERVER_RETENTION_SECONDS`.
- Set `OBSERVER_RETENTION_SECONDS=0` to disable stale-observer pruning and
  keep known observers visible regardless of age.
- Users can override the default target in the browser for each new code.
- `data/observer.json` is loaded at boot and updated when new observer names or
  coordinates are learned from MQTT metadata.
- `data/session-results.json` retains shareable result data for the configured
  retention window and is pruned automatically after expiry.
- The dashboard map only plots observers that have saved coordinates.
- `DASH_BROKER_HOST` only changes the broker label shown in the dashboard. It
  does not change the actual MQTT connection target.
- Result links use `/share/:sessionId` and remain available until the retained
  result expires.
- supported browsers can install the site as a standalone app from the
  dashboard.

## Run It

```bash
docker compose up -d --build
```

Default local URL: `http://localhost:3090`

If Turnstile is enabled:
- `/` serves the verification page
- `/app` serves the dashboard after a successful challenge

## Security Notes

- Keep port `3090` private to your reverse proxy or internal network.
- Session creation and Turnstile verification are rate-limited.
- Leave `TRUST_PROXY=1` when running behind Nginx or Cloudflare.
- The app only decodes the configured test channel and ignores all other
  channel traffic on the same MQTT topic.

## UI Notes

- The message hash in the active session card links directly to the packet
  analyzer when a hash is available.
- By default, the coverage map plots the current observer directory. Custom
  deployments can set `data-map-observer-scope="expected"` on the page `<body>`
  to plot only the observer set used for the active session score.
- The current session card includes a `Share` button that copies a retained
  `/share/:sessionId` link.
- The coverage map defaults to dark tiles and can be toggled to light tiles in
  the UI.
- Browsers that support PWA installation will show an `Install App` button in
  the dashboard.
- The footer always links back to the project repository.
- The optional hero link only appears when `EXTERNAL_LINK_URL` is configured.

## Decoder Note

The app now uses `@michaelhart/meshcore-decoder` for runtime MeshCore packet
decoding. The current upstream package already handles multibyte path-hop data,
and this repo applies a small postinstall compatibility patch so the published
CommonJS build still loads cleanly on Node 18.

## Star History

<a href="https://www.star-history.com/?repos=yellowcooln%2Fmeshcore-health-check&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=yellowcooln/meshcore-health-check&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=yellowcooln/meshcore-health-check&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=yellowcooln/meshcore-health-check&type=date&legend=top-left" />
 </picture>
</a>
