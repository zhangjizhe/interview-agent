# Portfolio local ingress decision

2026-11-05 · Bounded deployment candidate; bounded hosted-page acceptance passed; exact final CI remains pending. User chose local server now/spare PC later and explicitly authorized Sites server Secret plus Cloudflare transport.

Preserve the accepted NestJS/Prisma/Redis/Run/Trace/Gateway implementation. An independent Node gateway joins the existing API network and a separate ingress network. Only the gateway joins both; the tunnel has no API/database network. It forwards exactly portfolio chat POST and signed-answer GET, with exact Origin and independent constant-time checked server key. All admin/auth/health routes fail404. Strip visitor credentials/forwarded IPs; bound requests/responses/time; no redirects or answer URL logging. No schema, general auth API or model gateway change.

The hosted Site sends the dedicated key only from server code, stored in native runtime Secret. Site source/manifest/browser contain neither credential nor endpoint. The actual published single Agent, bounded fixed public corpus, signed tickets, existing Redis admission and quota/usage accounting remain authoritative. No PUBLISHED fixture or direct database publication is used. Public Origin is not authentication; gateway key is not a visitor identity, and may not be reused for JWT/SMTP/tickets.

Deployment keys live encrypted in local Keychain and in process memory after tmpfs injection, absent from Docker Config.Env. No background Keychain reader was approved/installed; restart fails closed until manual reinjection. Preserve original images and volumes. Rollback stops the separate ingress services and removes Site settings; do not delete data volumes.

[Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) provide a temporary testing address with no uptime guarantee. This phase does not certify permanent hosting, spare-PC migration or restoration. A stable hostname/managed ingress and destination OS/storage/network verification are separate work. The Site keeps its existing public audience.

The ten-case neutral synthetic document suite executes real Qwen requests and verifies deterministic source-ID/positive-Trace contracts only. Actual public-corpus and browser checks are separate. Historical unknown fees remain unknown; new tests use a private reservation ledger with ≤3CNY total/≤0.5CNY per call (current Agent cap0.03). Do not infer semantic quality or whole-product acceptance from contract pass or deployment receipt.
