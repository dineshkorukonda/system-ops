# Choosing background monitors

Host and process collectors always run. Optional integrations default to disabled: PM2, systemd services, traffic, backups, Ollama, Docker, databases, security, OS updates and Certbot. Enable each under Integrations → Background monitoring or set an initial `ENABLE_DOCKER=true`, `ENABLE_PM2=true`, `ENABLE_SERVICES=true`, `ENABLE_TRAFFIC=true`, `ENABLE_BACKUPS=true`, `ENABLE_OLLAMA=true`, `ENABLE_DATABASES=true`, `ENABLE_SECURITY=true`, `ENABLE_OS_UPDATES=true`, or `ENABLE_CERTBOT=true` environment flag. Persisted UI settings override flags.

Upgrading existing installations now requires selecting optional monitors explicitly. Disabled integrations do not run even during manual rescans or snapshot requests. Enabling or disabling applies immediately without a restart. Enabled monitors run independently of viewers. A previously collected snapshot may remain visible with a disabled collection status.

Discovery runs at five-minute intervals using filesystem indicators and existing monitor snapshots. It does not run PM2, Docker or database discovery again. Presence does not prove health or permissions: inspect the monitor's collection status/error. Rescan refreshes enabled monitors, and permission errors stay distinct from missing integrations.
