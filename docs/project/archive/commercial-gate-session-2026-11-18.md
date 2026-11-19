# Active task

2026-11-18 — Commercial acceptance gate / authenticated-session isolation.

User now requires product, design and device acceptance BEFORE delivery. Earlier local stages are provisional engineering evidence, not delivery. Establish explicit product/design/device/release gates with no silent omissions; current whole product stays NOT_ACCEPTED. Current focused implementation: reproduce and fix session-expiry/account-switch query cache isolation, preserve auth/ownership, test late responses and multi-tab behavior. No model/schema/permission changes planned, no live account or data migration.

Read current App/AuthGate/main/utils/auth and prior UX audit before changes. Red regression first, then relevant tests/type/lint/build, isolated normal-UI two-account browser checks; preserve real user session and old frontend. Physical iPhone/Android WeChat and native keyboards remain mandatory unverified evidence, not replaced by viewport mocks. Prior CI/real model/storage/report/public deployment blockers remain. No GitHub delivery claim without exact gates.
