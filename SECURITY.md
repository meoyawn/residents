# Security

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/meoyawn/residents/security/advisories/new). Include reproduction steps using fictional data. Do not attach credentials, resident lists or private conversations to public issues.

## Data visibility

- Building names, addresses, cities and apartment counts form the public building directory. Only publish building metadata intended for that directory.
- Building decisions, estimates, aggregate results, comments and activity require verified residency or administrative access in production. Comment authors' display names and assigned apartments are visible to other authorized readers in that building.
- Resident phone numbers, verification details and resident lists require administration rights for that building. Global webmasters and their authorized MCP clients can access those lists across buildings.
- WhatsApp verifies phone ownership. Building administrators independently verify residency; an apartment number is optional.
- Session tokens, OTPs and MCP tokens are never bundled in source. Session and MCP bearer tokens are stored hashed; OTPs are HMAC-hashed. Private HTTP responses disable caching. API error logs omit exception messages and request paths, which may contain personal data.

## Deployment secrets

Keep `OTP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` and `BOOTSTRAP_WEBMASTER_PHONE` in Cloudflare Worker secrets. Keep Cloudflare API credentials in your local credential store or CI secret storage. Never place credentials in `wrangler.jsonc`, frontend environment variables or example files. Follow [Cloudflare's secret configuration guide](https://developers.cloudflare.com/workers/configuration/secrets/).

Use the ignored `wrangler.local.jsonc` for installation-specific names, identifiers and routes. Generated Worker types, `.dev.vars*`, `.env*`, local databases, captures, imports, exports and build output must remain outside Git. The committed `.dev.vars.example` contains placeholders; use `aube run setup:local` to generate a fresh local secret.

Sandbox login requires both `AUTH_MODE=development` and a loopback hostname. Production must use `AUTH_MODE=whatsapp`. Never apply `seeds/demo.sql` to a remote database. Remove the bootstrap webmaster phone secret after provisioning.

If a real credential is ever committed or published, revoke or rotate it immediately; deleting a file or rewriting history does not revoke it. Avoid including secret values in incident reports.
