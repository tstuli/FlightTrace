# FlightTrace — FrSky Telemetry Analyzer

FlightTrace is a local-first static web application for importing, organizing,
charting, and diagnosing FrSky and generic telemetry CSV logs. The hosting
server delivers only the application shell. CSV contents and derived results
remain in the user's browser.

## Development

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
npm run lint
npm test
npm run build
```

Run browser tests after installing the Playwright browsers:

```sh
npx playwright install
npm run test:e2e
```

The checked-in tests use generated telemetry data. CSV files are ignored and
real flight logs must remain outside this repository.

## Local data and privacy

- Raw logs, model profiles, summaries, rules, events, and edited flight
  segments are stored in IndexedDB for the current browser origin.
- The application has no accounts, remote fonts, telemetry API, upload endpoint,
  analytics, or site-usage tracking.
- Users can request persistent browser storage and export a complete ZIP backup.
- Moving to a different domain creates a new browser origin. Export a backup on
  the old domain and restore it on the new one.

The host can still record normal requests for the static application files and
the visitor's IP address. It never receives the selected CSV through the app.

## Static deployment

The Vite build uses relative assets and hash routes, so `dist/` can be deployed
at a domain root or repository subpath.

### Cloudflare Pages

- Root directory: the repository root
- Build command: `npm ci && npm run build`
- Output directory: `dist`
- Node version: 22

The generated `_headers` file supplies the production security policy.

### GitHub Pages

The included workflow tests the app and deploys `dist/` after every push to
`main`. In the repository's **Settings → Pages**, select **GitHub Actions** as
the source. The default site URL is:

<https://tstuli.github.io/FlightTrace/>

GitHub Pages does not consume Cloudflare's `_headers` file, so equivalent
security headers require a fronting CDN or custom hosting configuration.

## Backup format

A backup is a ZIP archive with a versioned `manifest.json`, model/log metadata,
flight segments, diagnostic events, and raw CSVs under `logs/`. Log IDs are
SHA-256 content hashes and are used for duplicate detection during restore.

## License and warranty

Copyright © 2026 FlightTrace contributors.

FlightTrace is free software licensed under the [GNU General Public License
version 3](LICENSE) only (`GPL-3.0-only`). You may redistribute and modify it
under those terms, which require covered redistributed versions to remain
available under the GPL with corresponding source code.

FlightTrace and its telemetry analysis are provided **as is**, without warranty
of any kind, to the extent permitted by applicable law. Analysis is advisory;
always follow the guidance supplied by the aircraft, radio, receiver, battery,
engine, and telemetry-equipment manufacturers. See sections 15 and 16 of the
license for the complete warranty disclaimer and limitation of liability.
