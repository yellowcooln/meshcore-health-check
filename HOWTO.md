# How To Run Mesh Health Check

## Purpose

Mesh Health Check measures how well a MeshCore `GroupText` message reaches your
observer network. The app generates a short code, waits for that code to appear
in the configured channel, then scores coverage based on the observer set for
that code.

It does not transmit anything. It only watches MQTT, matches messages, and
summarizes observer coverage.

## Requirements

- Docker and Docker Compose
- network access to the MQTT broker
- a valid MeshCore channel name and secret
- optional observer name mappings in
  [data/observer.json](/home/yellowcooln/mesh-health-check/data/observer.json)
- writable retained results storage in `data/session-results.json`

## Setup

1. Copy the template:

```bash
cp .env.example .env
```

2. Edit [`.env`](/home/yellowcooln/mesh-health-check/.env):

- set MQTT connectivity
- set `TEST_CHANNEL_NAME`
- set `TEST_CHANNEL_SECRET`
- set `KNOWN_OBSERVERS` if you want a fixed default scoring set
- set `OBSERVER_RETENTION_SECONDS` if old observers should disappear from the
  dashboard directory and map after a chosen age
  Set it to `0` to disable pruning and keep known observers visible.
- set `DASH_BROKER_HOST` if the UI should show a public broker label instead of
  the internal Docker or LAN broker hostname
- enable Turnstile if the site is internet-facing
- leave `LOG_LEVEL=info` unless you are actively troubleshooting

3. Start the service:

```bash
docker compose up -d --build
```

4. Put it behind your reverse proxy or use `http://localhost:3090`.

## What Users See

1. The user opens the site.
2. If Turnstile is enabled, the user solves the challenge on `/`.
3. The dashboard loads and creates a code.
4. The user sends that code to the configured channel.
5. The app waits for a matching channel message and then aggregates receipts for
   the same message hash.
6. The dashboard shows health, observer-by-observer receipts, and path detail.
7. If observer coordinates are known, the dashboard also shows a coverage map
   and a receipt timeline.
8. The user can copy a share link for the current result.
9. In supported browsers, the dashboard can also be installed as a standalone
   app.

Users can either:

- use the default observer set from `KNOWN_OBSERVERS`
- pick a custom observer set in the browser for the next code only

## Result Meaning

- `VERY HEALTHY`: most target observers saw the packet
- `GOOD` or `FAIR`: partial target coverage
- `POOR`: very limited coverage or no receipts yet

Each code:
- expires after `SESSION_TTL_SECONDS`
- can be used up to `MAX_USES_PER_CODE` times
- keeps prior results in browser-local history only for that browser session

Shared results:
- are retained server-side for `RESULT_RETENTION_SECONDS`
- default to one week
- are pruned automatically once the retention window expires
- live at `/share/:sessionId`

## Observer Naming

The app loads
[data/observer.json](/home/yellowcooln/mesh-health-check/data/observer.json) at startup
so known names and coordinates are available immediately. If MQTT metadata later
publishes a better name or location, the server writes it back to that file.

Without `data/observer.json`, unnamed observers show as shortened pubkeys until
metadata propagates. Observers without coordinates still work for scoring, but
they will not appear on the map until MQTT metadata or a saved profile provides
`lat` and `lon`.

## Why Turnstile Is Highly Recommended

If the site is public, bots can create codes just like real users. Rate limits
help, but Turnstile is still the cleanest first line of defense.

Turnstile reduces:

- automated session creation
- junk traffic against the landing page and session endpoint
- abuse of a public health-check surface backed by your observer mesh

If the site is private and reachable only on an internal network, Turnstile is
optional. If the site is public, it should be enabled.

## Operational Notes

- The app only decodes the configured test channel.
- `DASH_BROKER_HOST` affects only the dashboard label shown to users. MQTT
  still connects to `MQTT_HOST` or `MQTT_URL`.
- Default observer scoring comes from `KNOWN_OBSERVERS` if set, otherwise from
  the active observer window.
- Observers that have not been heard from within `OBSERVER_RETENTION_SECONDS`
  are omitted from the dashboard directory and map.
- `data/` is bind-mounted so learned observer names and retained share links
  survive rebuilds.
- Port `3090` should stay private to your reverse proxy or internal network.
- `LOG_LEVEL=debug` is useful only when you are tracing MQTT ingest or decode
  problems.
- `EXTERNAL_LINK_URL` and `EXTERNAL_LINK_LABEL` control the optional hero CTA.
  Leave them blank to hide it.
- installable app support does not require extra env configuration; it uses the
  manifest and service worker bundled with the app

## Troubleshooting

- `MQTT offline`: check broker settings and credentials in `.env`
- `WAITING` forever: verify the code was sent to the correct channel and that
  the message reached MQTT
- shared result says it is unavailable: the retained result likely expired and
  was pruned from `data/session-results.json`
- raw pubkeys instead of names: add mappings to `data/observer.json` or wait for
  metadata to propagate
- map missing some observers: they do not have saved coordinates yet
- no install prompt: the browser may not consider the site installable yet, or
  it may not support install prompts on that platform
- Turnstile never appears: verify `TURNSTILE_ENABLED`, site key, and secret key
- Turnstile always fails: verify the hostname is allowed in Cloudflare
- low scores: the packet may have had limited reach, or your default target set
  may be stricter than the currently active observer window
