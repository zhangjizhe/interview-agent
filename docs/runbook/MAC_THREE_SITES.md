# Mac server: Agent Lab, Interview and personal website

2026-11-17. Target design and preparation only. No target-machine install, restore, DNS change or public cutover has been performed. The target is described as a 2017 Mac with a reinstalled system; its exact OS, architecture, memory and disk remain unknown.

## Entry points

User-selected domain: `zhezone.cn` (2026-11-17). The user is completing registrar identity verification and expects to be able to purchase later today. Purchase, ownership and availability are not confirmed; these are planned routes, not live endpoints.

| Proposed hostname | Application | Intended audience |
| --- | --- | --- |
| `zhezone.cn`, optionally `www.zhezone.cn` | Personal website and AI counterpart | Public |
| `interview.zhezone.cn` | Interview application | Login/registration flow |
| `lab.zhezone.cn` | Agent Lab console | Owner/authorized administrators |

Use a managed, named Cloudflare Tunnel with stable DNS routes. Cloudflare documents outbound connections without requiring a public origin IP or router inbound ports. This does not guarantee reachability or speed from the target network; measure those before cutover. Do not use the temporary Quick Tunnel as the permanent endpoint.

Keep PostgreSQL, Redis and vector services private. Prefer same-origin application API routes to exposing a catch-all public API hostname. The Lab hostname needs an additional access policy as well as application RBAC. The Interview entry must not provide an alternate path around the management boundary: current Web and Lab Nginx both proxy the shared `/api/`, and Lab controllers use `/api/agent-lab`. Route isolation needs implementation and negative tests before public exposure; protecting the Lab UI hostname alone is insufficient.

## Development and server build workflow

User-confirmed 2026-11-17: the current computer remains the development machine; the other Mac pulls source, builds and deploys every accepted release. This is the agreed target workflow, not an installed deployment pipeline.

1. Develop and run relevant verification on the development machine. Commit only reviewed task changes to `agent-lab`; record the full commit SHA and require matching green release checks before deployment. Do not deploy an arbitrary latest branch tip or uncommitted workspace.
2. On the server, fetch that exact approved revision into a separate release directory. Require a clean source checkout. The personal website currently has a separate source revision and local modifications: include its reviewed, reproducible source revision in the release manifest as well as the API, Web and Lab revision.
3. Build application images on the server for its own CPU architecture, using the checked-in lockfile and recorded base-image identities. Record source SHA, image IDs, configuration revision and build/check results. Do not copy development-machine dependency folders, local preview services or secrets into the build context. A native build can still fail if a dependency or base image does not support the target; verify it.
4. Keep runtime secrets and persistent data outside release directories. Run only one deployment at a time; drain active work and take verified backups before schema/data changes. Do not remove named volumes or start a second writable production database when changing release directories.
5. Start the candidate behind the private entry, run readiness and matching authentication, permissions, website SSE and trace/report checks, then switch the public entry. Retain the previous image and release manifest. Application rollback must be compatible with the database state; do not automatically roll back database migrations or overwrite newly written data.

For initial setup, use a supervised server-side release command. Unattended GitHub-triggered deployment is a later step after target access, least-privilege deployment credentials, failure handling and rollback are verified. The domain purchase alone does not establish server access. No remote login credential or CI deployment secret has been configured by this document.

## Domain purchase checklist

Choose one standard-priced domain for one year, with an explicit renewal price; subdomains do not require separate registrations. For this planned self-hosted setup, the initial cart needs only the domain registration. Hosting, a paid website builder, a paid certificate or a business mailbox are not prerequisites for these three applications. Any future optional service must be selected separately. Enable account protection and renewal reminders, and complete the registrar's required owner/contact verification directly with the registrar. Do not send payment details or account passwords in chat.

Registrar availability and prices change; compare the final cart and renewal terms before payment. Purchasing and DNS configuration are separate steps. The user has not purchased the selected domain yet; availability and ownership are unverified. Do not create DNS routes or treat it as an owned production origin before purchase is confirmed.

## First action on the target Mac

Copy `scripts/mac-server-preflight.sh` to the target and run `sh mac-server-preflight.sh`. It reports only OS, CPU architecture, RAM, free root-disk space and installed Docker/Compose client versions. It does not install software, read `.env`/Keychain or inspect application data. A successful result does not prove the Docker daemon or application is ready.

Docker's current Mac installation guide supports the current and two prior major macOS versions, and states a 4 GB Docker Desktop minimum. That is not a sizing guarantee for this application. This repository also starts PostgreSQL, Redis, Qdrant, Milvus and etcd; budget based on target resources and measured service usage. For initial planning, 16 GB RAM and at least 80 GB free SSD space are a working recommendation, not a tested minimum. If the installed macOS is unsupported, select a supported host/runtime after reviewing the machine; do not silently install obsolete Docker or erase/reinstall the machine.

Official references checked 2026-11-17:

- https://docs.docker.com/desktop/setup/install/mac-install/
- https://developers.cloudflare.com/tunnel/
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/

## Stages and exit conditions

1. **Target preflight:** confirm system, architecture, capacity, Docker daemon readiness, stable power/network and operating/sleep conditions. Do not change the old machine yet.
2. **Freeze a reproducible source bundle:** committed `agent-lab` currently has the streaming work at7405555, while the latest first-person presentation and citation fix remain local. The deployed website's separate source is based on Site7/f8e8cfc with local modifications. A plain clone of `main` or `agent-lab` will not reproduce the current local demo. Inventory and include only reviewed task changes; keep unrelated historical WIP out. Existing CI security-audit failures remain release blockers; never waive them to cut over.
3. **Back up and restore locally:** drain in-flight Runs, then snapshot PostgreSQL, Redis request/idempotency state, and the vector/file stores actually in use. Verify a separate restore and record image versions and data counts. Preserve accounts, organizations, published versions, reports, Run/Trace and the cost ledger. A schema migration is not a data restore. Keep one writable primary and retain the old host for rollback.
4. **Configure target secrets locally:** model, SMTP, JWT/OTP, portfolio ticket, gateway and tunnel credentials travel through a private channel and the target's protected storage. Do not put them in the source bundle, GitHub, a public download or chat. Check credential helpers against the target CPU; do not assume a local binary or hardware-bound Keychain is portable. Prefer target-native builds or reviewed multi-architecture images rather than blindly copying the current host's Docker VM or image archives.
5. **Prepare production routing:** current5174 is a strict loopback preview with a fixed Host/Origin adapter; it cannot simply be forwarded unchanged under a new domain. Prepare a production website entry with the real canonical HTTPS origin, exact API origin allowlist, server-only gateway credentials if needed, and unbuffered SSE. Match CORS, proxy headers, authentication and cookie/storage behavior to each hostname. Same backend identity does not automatically mean a shared browser session across subdomains.
6. **Domain and controlled cutover:** configure DNS, managed Tunnel routes and management access rules only after local recovery works. Verify outside the server network: website question/follow-up/refusal, first-person evidence boundaries, real SSE increments, normal login/email flows, management route isolation, report-to-Run/Trace links and idempotent recovery. Check restart recovery and costs. Switch traffic once; record rollback and data-write ownership.

## Known incomplete work carried forward

- Source/CI: PR #73 has an unchanged-dependency security-audit failure. Persona changes are not yet committed/pushed.
- Website: actual first-person career and RTC follow-up completed locally, but the final live citation-regression check was not executed because automatic approval review hit its usage limit. The citation fix passed its offline regression and was copied to the local preview. Do not mark that browser check passed.
- Persona costs: two real model examples completed in the page, but their final Run/usage/cost reconciliation has not yet been recorded. Treat those costs as unknown until read back; do not enter zero. A prior paid baseline was retained without replay.
- Public hosting: previous `chatgpt.site` TLS access failed and the restricted external gateway is JSON-only. Neither proves the planned self-hosted domain works.
- Target Mac, domain ownership, DNS, remote access, target image compatibility, target data restore and reboot recovery are still unverified.

This document is a plan, not a production-ready Compose profile or a claim that the services have been migrated.
