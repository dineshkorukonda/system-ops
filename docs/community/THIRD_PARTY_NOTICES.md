# Third-party notices

System Ops source is licensed under MIT. Dependencies retain their own licenses; the project license does not replace them.

The runtime uses MIT/BSD/Apache-licensed libraries including Express, React, Leaflet, and UA Parser v1. `ua-parser-js` is intentionally constrained to its MIT v1 line; v2 uses a different license and is excluded from automated upgrades. `geoip-lite` code uses Apache-2.0; its bundled geolocation data carries separate upstream attribution and terms. Preserve the installed package notices/data licenses when redistributing; review MaxMind/GeoLite requirements before replacing or distributing datasets. Geographic results are estimates.

The release source archive includes package-lock.json for an exact dependency inventory. Run `npm run licenses:report` after `npm ci` to generate a versioned installed-package license report. That report inventories declared licenses; inspect package LICENSE/NOTICE files for redistribution terms. It is not an assertion that all dependency obligations disappear under MIT.

Public-site screenshots are generated from this project's interface with disposable fixture data. No production credentials or operator data should be included.
