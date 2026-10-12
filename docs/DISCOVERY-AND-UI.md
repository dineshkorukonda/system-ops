# Detected sources and category workspace

The initial overview shows detected and explicitly configured sources. Undetected sources are hidden until requested. Detection means filesystem or monitored evidence, not service health. Installing a CLI does not prove a daemon is running. Cached error objects and empty initial snapshots never establish presence.

Sources expose evidence, configuration, monitoring preference, source errors, last success and unknown counts. PM2 uses actual account homes, explicit paths and the restricted helper configuration. Private homes need explicit configuration/access. Docker supports configured sockets and recognizes rootless socket evidence; daemon connection failure is distinct from permission denial. SSL discovery uses active Nginx configuration and Let's Encrypt files; native X509 parsing avoids requiring an openssl subprocess for local expiry. Traffic discovers custom access_log directives. Set NGINX_CONFIG_DIRS for nonstandard active config directories. Discovery scans are bounded and never install software or start a daemon.

Navigation groups views into Overview, Host, Applications, Network & security, Storage and Settings. Category buttons reveal detected/configured/enabled views. Monitoring preferences persist on the server; navigation visibility and light/dark theme persist in this browser. Existing PM2 app URLs remain supported. Disabled integrations show a setup state instead of healthy zero charts. SSL has a dedicated expiry view; expiry alone does not prove certificate trust.

All views use shared theme colors for text, surfaces and status badges. The refreshed shell has keyboard focus, skip-to-content, mobile navigation and readable empty/error states. No external fonts or script CDNs are required for initial rendering; Leaflet is bundled and loaded only for an enabled geolocation view. Map tiles still come from OpenStreetMap. Docker, PM2 and service logs are requested on selection and cancelled when navigating away.

## Reproducible tests

Run npm ci, npm test, npm run typecheck, npm run build and npm run test:smoke. For browser tests, install Chromium with `npx playwright install chromium`, then run `npm run test:ui`. On Windows an existing Edge binary can be supplied through PLAYWRIGHT_EXECUTABLE. The UI fixture has disposable settings, test-only credentials and local endpoints. It does not touch production services.

| Coverage | Evidence |
| --- | --- |
| Detection | Absent/configured/disabled/inaccessible sources; rootless Docker; explicit PM2 homes; failed-user visibility; zero/unknown counts; stale collection |
| Nginx | Custom access-log paths, comments, quoted certificate paths and nested locations before SSL directives |
| Existing backend features | Full Node suite covering auth, settings, commands, cancellation, cache contracts, processes, backups, traffic bounds, security and TLS helpers |
| Browser contracts | Every view in both themes; all views at phone width; category navigation; preferences/reload; monitoring settings success/failure; rescan; branding save; discovery error/empty state; keyboard skip; PM2 duplicate-name IDs/reload; certificate expiry; Docker failure; logout |
| Accessibility | Axe checks for the refreshed overview, sidebar and top bar in both themes. This is scoped automated coverage, not a full WCAG certification |
| Real Ubuntu adapters | CI starts real multi-user PM2 daemons and a Docker container, verifies inventory/logs, generates a certificate for native X509 parsing and a local TLS handshake, and ingests a real access log |

Browser reports, failure traces and screenshots are uploaded by CI. Adapter receipts are separate from browser fixtures. A fixture passing does not prove your production host's permissions, Docker context, Nginx includes/custom modules or reverse-proxy setup. Arbitrary recursive Nginx include/glob layouts are not exhaustively parsed; explicit configuration paths remain supported. Persistence, uptime history, notifications, Prometheus and atomic upgrades remain separate roadmap work.
