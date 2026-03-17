# Repository Guidelines

## Project Structure & Module Organization

- `server.js`: Express API, MQTT client, MeshCore packet parsing, session
  matching, rate limiting, Turnstile handling, observer persistence, and
  WebSocket broadcast.
- `public/`: standalone frontend assets.
  - `index.html`: dashboard shell
  - `app.js`: dashboard state, observer selection, coverage map, receipt
    timeline, API calls, WebSocket updates, rendering
  - `sw.js`: PWA service worker for installable app support
  - `styles.css`: dashboard layout and responsive styling
  - `landing.html`, `landing.css`, `turnstile-landing.js`: Turnstile landing flow
- `.env` and `.env.example`: the only runtime configuration source for this
  repo, including the optional `DASH_BROKER_HOST` UI-only broker label.
- `observer.json`: persistent observer public-key profile map with `name`,
  `lat`, and `lon`, mounted into the container and updated by the server.
- `session-results.json`: retained session result store used for shareable
  `/share/:sessionId` links.
- `README.md`: architecture and flow overview.
- `HOWTO.md`: deployment and operator guide.
- `CHANGES.md`: versioned project change log.

## Build, Test, and Development Commands

- `docker compose up -d --build`: build and start the app.
- `docker compose logs -f`: follow startup, MQTT, and runtime logs.
- `docker compose down`: stop the service.
- `npm run check`: syntax-check backend and frontend JS used in CI.
- `npm test`: run Node unit and API tests.
- `npm run test:smoke`: run Playwright browser smoke tests.
- `node --check server.js`
- `node --check public/app.js`

Use Docker for runtime validation. Host `npm start` is not a supported workflow,
but `npm test` and `npm run check` are valid for local CI-style verification.

## Coding Style & Naming Conventions

- Use ASCII and 2-space indentation in JS, HTML, CSS, and Markdown.
- Use `camelCase` for functions and variables.
- Use `UPPER_SNAKE_CASE` for env vars and constants.
- Keep new dependencies to a minimum; prefer small local helpers for auth,
  parsing, rate limiting, and Turnstile verification.
- Keep MQTT packet handling scoped to the configured test channel only.
- Keep UI changes consistent with the existing single-page flow.
- Prefer learning observer metadata from MQTT and persisting it into
  `observer.json` instead of introducing new external runtime lookups.

## Testing Guidelines

- Minimum validation for app changes:
- run `docker compose up -d --build`
- run `npm run check`
- run `npm test`
- run `npm run test:smoke` when UI or routing changes
- confirm `curl -s http://localhost:3090/api/bootstrap`
- confirm observer names resolve from `observer.json` before fresh MQTT metadata
  arrives
- confirm observer coordinates resolve from `observer.json` or MQTT metadata if
  map behavior changes
- confirm retained session results are written to `session-results.json` if
  share behavior changes
- confirm `GET /manifest.webmanifest` returns valid app metadata if PWA support changes
- confirm session creation still works, including default and custom observer
  sets
- confirm the coverage map behaves correctly when coordinates exist and when
  they do not
- confirm session creation is still rate-limited
- if Turnstile is enabled, confirm `/api/verify-turnstile` and landing flow
- review `docker compose logs --tail=50`

## Commit & Pull Request Guidelines

- Use short imperative commit messages, for example: `Add cookie auth flow`.
- PRs should include:
  - behavior summary
  - config changes
  - manual verification steps
  - screenshots for UI changes

## Security & Configuration Tips

- Do not commit real MQTT credentials or production tokens unless explicitly
  intended for the deployment repo.
- Keep `TRUST_PROXY=1` behind Nginx or Cloudflare.
- Keep Turnstile keys only in local deployment config.
- Keep port `3090` private to the proxy or internal network.
- Do not add runtime dependencies on sibling repositories.
- Keep `KNOWN_OBSERVERS` values as full pubkeys, not display names.
- Keep `DASH_BROKER_HOST` aligned with the public-facing broker label you want
  users to see; it does not affect the actual MQTT connection.
- Keep `RESULTS_FILE` writable and mounted if you expect shared result links to
  survive container restarts.
- The repo footer link is fixed to the project repository; only the optional
  external hero link should be env-configurable.
