# Cost reconciliation: user-reported nine CNY

Read-only audit on2026-11-19 for the Beijing2026-11-18 window (UTC2026-11-17T16:00:00Z through2026-11-18T16:00:00Z). User reports nine CNY of Qwen allowance consumption. **UNRECONCILED**: user confirmed Alibaba Cloud Bailian/DashScope API consumption billing; the provider statement, exact model/amount breakdown and billing interval are not yet available. Do not label it development expense, a confirmed provider charge or zero based on incomplete local evidence.

## Work and observed receipts

The Nov18 Web session/cache isolation candidate fixed expiry/account-switch stale private data, tab synchronization, sensitive form cleanup and atomic session publication. Its local receipt reports75/75 related regression cases. Browser verification used a loopback synthetic API; test execution used a network-disabled container. No real provider test/upload/report operation was made by that focused phase. Candidate remained undeployed/unpushed. The later45-case preparation/27-layout checkpoint is datedNov19 and is separately scoped.

Actual local PostgreSQL read-only results for Nov18:

| Beijing time | Record | Evidence / limit |
| --- | --- | --- |
|12:24:40 Run creation /12:24:47 model end|One COMPLETED portfolio-evidence-guide configured Run; Qwen qwen-plus|881 prompt+153 completion tokens, estimated0.0010108CNY. Engineering estimate, not a provider bill.12:24:44 has one LLM_CALL admission entry; do not double-count it as another provider call |
|15:11:31|Another LLM_CALL admission entry|Metadata absent; no linked cost/usage evidence established by this audit. Actual provider invocation/outcome/cost remain unknown |

No Interview messages or session-cost rows updated in that window. There were no PENDING/RUNNING Lab Runs at audit time. These observations do not establish zero account-wide spend, rule out all other services, or prove that every admission became a billed call. The quota reservation is written before the provider request. API logs for the window contained13 lines and no matching Qwen/error/quota evidence; sparse logs are not accounting proof.

The private portfolio cost-ledger file was last modified onNov16. It retains four historical unknown Run costs. Its engineering estimates/reservations do not reconcile Nov18 or the user's cloud allowance display; reserved amounts must not be added up as final bills.

## Confirmed accounting gap

Both current source and the running API's compiled ResumeRAGService contain a direct OpenAI-compatible embeddings client using text-embedding-v3. It does not use QuotaService/LlmGatewayService for that path. Thus Run/Trace and unified quota/cost counts cannot be assumed to cover all resume embedding spend. This is a real coverage gap, **not evidence that it explains nine CNY**. No inference about uninspected callers or key misuse is justified.

## Required next evidence / boundary

User confirmed DashScope/Bailian API consumption billing. Exact day versus cumulative period, model names, amounts and provider statement are still requested. Reconcile per-model usage/cost and, where available, key/request identity without exposing credentials. Also establish any other deployment using the same authorized key. Do not infer billing from a screenshot of a balance alone or use current catalogue estimates as invoices.

This audit performed only read queries, source/compiled-code inspection and filtered metadata/log aggregation. No model calls, new tests, service restart, credential/permission change or code deployment. No new price estimate or external-provider billing verification. No source fix or commercial acceptance; the accounting gap and reconciliation remain P1 before real paid acceptance is called complete.


## Provider-product clarification

User confirmed the display is Bailian/DashScope API consumption billing, not a developer-tool plan. Official billing/usage documentation checked2026-11-19: [billing and cost management](https://help.aliyun.com/zh/model-studio/bill-query-and-cost-management), [model usage](https://help.aliyun.com/zh/model-studio/model-usage-statistics). Billing detail can be filtered by period/model/API Key ID; use ID rather than the secret key. Exact UI/data coverage and bill amounts must still be read from the user's own statement; no provider login or account billing read was performed here.

Additional source-only inspection found direct text-embedding-v3 helper calls in KnowledgeBaseService and MilvusMemoryStore as well. Their existence/wiring does not prove yesterday's execution or nine-CNY attribution. No new endpoint was exercised. These paths require caller/usage coverage review in the separate accounting repair scope.
