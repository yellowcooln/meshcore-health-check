<h1 align="center">Mesh Health Check</h1>

<p align="center">
  Check how far your MeshCore messages reach.<br />
  Self-hosted observer coverage tests, receipt timelines, and shareable results.
</p>

<p align="center">
  <a href="https://github.com/yellowcooln/meshcore-health-check/releases"><img src="https://img.shields.io/github/v/release/yellowcooln/meshcore-health-check?style=flat&amp;color=0f766e" alt="Latest release" /></a>
  <a href="https://github.com/yellowcooln/meshcore-health-check/actions/workflows/ci.yml?query=branch%3Amain"><img src="https://img.shields.io/github/actions/workflow/status/yellowcooln/meshcore-health-check/ci.yml?branch=main&amp;style=flat&amp;label=CI" alt="CI on main" /></a>
  <a href="https://github.com/yellowcooln/meshcore-health-check/actions/workflows/docker-publish.yml?query=branch%3Amain"><img src="https://img.shields.io/github/actions/workflow/status/yellowcooln/meshcore-health-check/docker-publish.yml?branch=main&amp;style=flat&amp;label=docker%20build" alt="Docker build on main" /></a>
  <a href="https://hub.docker.com/r/yellowcooln/meshcore-health-check"><img src="https://img.shields.io/docker/pulls/yellowcooln/meshcore-health-check?style=flat&amp;logo=docker&amp;logoColor=white" alt="Docker pulls" /></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> &middot;
  <a href="./HOWTO.md">Documentation</a> &middot;
  <a href="./ENVIRONMENT.md">Configuration</a> &middot;
  <a href="./CHANGES.md">Changelog</a> &middot;
  <a href="https://github.com/yellowcooln/meshcore-health-check/issues">Report an issue</a>
</p>

![Mesh Health Check showing a test code and observer coverage result](./image1.png)

<p align="center"><em>Generate a code, send it on your MeshCore channel, and see which observers received it.</em></p>

## Features

- Match MeshCore GroupText messages from MQTT and score coverage against selected observers.
- Inspect receipt timing, paths, RSSI, SNR, repeaters, and estimated packet-path distances.
- View observer coverage on a map with light/dark themes and no required map API key.
- Choose activity-ranked defaults, fixed observers, geographic regions, or nearby observers.
- Keep session history and share retained results through a link.
- Optionally recognize public MeshCore routing scopes and offer longer test codes.
- Support Cloudflare Turnstile and installation as a PWA.

## How it works

1. Copy the generated code from the dashboard.
2. Send it yourself on the displayed MeshCore channel using your radio/client.
3. Watch MQTT-connected observers report the matching message and compare the results.

**The app does not transmit for you.** Its score measures receipts from the selected observer set, not guaranteed coverage everywhere. Before a matching message arrives, the check shows **Awaiting message** rather than a score.

The score retains the targets saved with a used code. Changing observers updates the map and the targets for the next code, without rewriting the old result. See the [user flow](./HOWTO.md#user-flow) and [result explanation](./HOWTO.md#result-meaning).

## Quick start

### Run the prebuilt Docker image

Images are available on [Docker Hub](https://hub.docker.com/r/yellowcooln/meshcore-health-check). No local build is required:

- `yellowcooln/meshcore-health-check:latest`: production image from `main`.
- `yellowcooln/meshcore-health-check:dev`: development image from `dev`.

The published image currently targets **Linux amd64**. Check platform compatibility before installing it on an ARM host.

You need Docker with the Compose plugin, access to a MeshCore MQTT feed, and the test channel's name and secret or hash.

```bash
mkdir meshcore-health-check
cd meshcore-health-check
mkdir -p data
curl -fsSL https://raw.githubusercontent.com/yellowcooln/meshcore-health-check/main/.env.example -o .env
```

Edit `.env` **before starting the app**:

- Set MQTT connectivity, credentials, and subscription topic for your network.
- Set `TEST_CHANNEL_NAME` and `TEST_CHANNEL_SECRET` or `TEST_CHANNEL_HASH`.
- For a public site, configure `SITE_URL`, trusted proxy settings, and valid Turnstile keys. The template enables Turnstile by default.
- For a private local trial without Turnstile, explicitly set `TURNSTILE_ENABLED=false` and `TRUST_PROXY=false` when accessing it directly.

Create `docker-compose.yml` alongside `.env`:

```yaml
services:
  mesh-health-check:
    image: yellowcooln/meshcore-health-check:latest
    restart: unless-stopped
    env_file:
      - ./.env
    environment:
      PORT: "3090"
    volumes:
      - ./data:/app/data
    ports:
      - "3090:3090"
```

Pull and start:

```bash
docker compose pull mesh-health-check
docker compose up -d --no-build mesh-health-check
```

Open **http://localhost:3090**, or use your server's address. Keep the published port on a trusted network or behind your reverse proxy. In Docker, `MQTT_HOST=localhost` points at this container, not a broker on the host; use a reachable broker address or a service name on a shared network.

No map key is required: dark maps use OpenFreeMap, with OpenStreetMap for light maps and fallback. External tiles still need network access. See the [deployment guide](./HOWTO.md#setup) for optional mounts and hosting details.

### Build from source instead

```bash
git clone https://github.com/yellowcooln/meshcore-health-check.git
cd meshcore-health-check
cp .env.example .env
```

Configure `.env` as above, then use the repository's source-build Compose file:

```bash
docker compose up -d --build
```

Do not combine its `build` / `pull_policy: build` settings with the image-only example. Choose one deployment method.

## Configuration

See [`.env.example`](./.env.example) for template values and [ENVIRONMENT.md](./ENVIRONMENT.md) for the full reference.

| Setting | Purpose |
| --- | --- |
| `MQTT_HOST`, `MQTT_PORT`, `MQTT_TRANSPORT`, `MQTT_TLS` | MQTT connectivity; `MQTT_URL` can override the connection URL. |
| `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_TOPIC` | Subscriber credentials and topic. |
| `TEST_CHANNEL_NAME`, `TEST_CHANNEL_SECRET`, `TEST_CHANNEL_HASH` | Channel used for matching test messages. |
| `APP_TITLE`, `SITE_URL`, `DASH_BROKER_HOST` | Site branding, public URL, and display-only broker label. |
| `KNOWN_OBSERVERS`, `OBSERVER_TOP_COUNT` | Fixed defaults or activity-ranked observer count. |
| `REGIONS_FILE`, `ALLOWED_REGION_GROUPS`, `ALLOWED_REGIONS`, `INITIAL_REGION` | Geographic controls, allowed area, and initial selection. |
| `DISTANCE_UNIT`, `NEARBY_DEFAULT_RADIUS` | Miles/kilometers and nearby search radius. |
| `BROWSER_LOCATION_ENABLED` | Optional browser-location controls; location is requested only on click. |
| `CODE_PREFIX`, `ALLOW_LONGER_TEST_CODES` | Code prefix and optional 6-16-character suffix selection. |
| `MESHCORE_REGION_SCOPES_FILE` | Optional operator-owned YAML for public routing-scope names. |
| `TURNSTILE_ENABLED`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Visitor verification. |
| `RESULT_RETENTION_SECONDS` | How long saved result links remain available. |

Geographic labels and MeshCore routing scopes are different features. Geographic filters affect observer selection; scope recognition does not change scoring or prove repeater membership. Configure your own public names using [region-scopes.example.yml](./region-scopes.example.yml), with the [read-only mount and matching limitations](./HOWTO.md#optional-meshcore-routing-scopes).

Nearby selection is optional and temporary. Precise visitor coordinates stay in the browser; only selected observer keys enter the session workflow. Proximity does not guarantee RF coverage. See [nearby observer selection](./HOWTO.md#select-nearby-observers).

## More examples

### Receipt timeline

![Observer reports showing relative receipt times](./image2.png)

### Coverage map

![Coverage map showing reached and unreached observers](./image3.png)

The screenshots illustrate existing deployments. Available controls and styling may differ by release and configuration.

## Updates and storage

Keep `./data:/app/data` mounted to retain observer profiles, activity history, and saved share results. Back up data, `.env`, Compose overrides, and custom assets before upgrading. Do not overwrite working configuration with the template or leave old full-file frontend overrides masking newer image assets.

For an image-based installation:

```bash
docker compose pull mesh-health-check
docker compose up -d --no-build --pull never --force-recreate mesh-health-check
```

Recreation also reloads `.env`. **A plain `docker compose restart` does not.** Follow the [upgrade checklist](./HOWTO.md#upgrading-to-v142) for source-build steps and compatibility checks.

Inspect startup and ingestion without creating a test session:

```bash
docker compose logs --tail=100 -f mesh-health-check
curl -fsS http://localhost:3090/api/bootstrap
```

A successful HTTP response or MQTT connection alone does not prove RF delivery. Verify receipts with a code you deliberately transmit on the configured channel.

## Development

Use Node.js 24 (`nvm use` reads `.nvmrc`). From the repository root:

```bash
npm ci
npm run check
npm test
npm run test:smoke
```

Use Docker Compose for runtime validation. The backend is in `server.js`, browser assets are in `public/`, and regression tests are in `test/`. See the [technical notes](./HOWTO.md#technical-notes) for renderer, decoder, and persistence details.

## Credits and license

The idea for this app came from Nick D from Boston.

Community deployment: [UK Mesh Health Check](https://healthcheck.ukmesh.com/).

Licensed under the [MIT License](./LICENSE). Preserve the copyright and license notice when using, modifying, or redistributing the software.

## About these projects

I build these projects with the help of AI when I see a need for software I want to use myself. The goal is to make something useful, run it on my own systems, and share it with anyone else who might find it helpful.

This is something I do for fun, in my free time outside of work and family. If you find these tools useful and would like to support the time that goes into them, a little support on [Ko-fi](https://ko-fi.com/yellowcooln) is always appreciated. No pressure. Using the software, reporting bugs, and contributing ideas helps too.
