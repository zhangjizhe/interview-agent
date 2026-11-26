# Real Provider A/B Benchmark: Interview Engine `v1 (multi)` vs `v2 (fast-dual)`

- **Date**: 2026-11-25
- **Branch / Commit**: `agent-lab` (`ca83c6f`, container image `interview-api:candidate-ca83c6f`)
- **Provider / Routing**: Real DeepSeek API (`LLM_PRIMARY_PROVIDER=deepseek`, fallback `qwen` standby, `0` fallbacks, `0` circuit trips)
- **Approved Budget Cap**: ¥3.00 CNY (Actual combined spend: **¥0.5007 CNY**, `costStatus: available`, pricing catalog `2026-10-09.1`)
- **Methodology**: Identical 5-turn senior AI Agent Full-Stack Engineer interview script (architecture, circuit-breaker, cost/caching, shallow-answer dodge, Redis idempotency) executed end-to-end against live `POST /api/interview/:interviewId/message` SSE endpoint and PostgreSQL `session_costs`. Temporary benchmark user and session rows were cleaned up after export.

---

## 1. Quantitative Comparison (5 Real Turns Each)

| Metric | `v1 (multi)` (5-Node LangGraph) | `v2 (fast-dual)` (Single-Call Streaming Hot Path) | Delta |
| --- | ---: | ---: | ---: |
| Successful Turns | 5 / 5 | 5 / 5 | Equal |
| **Avg TTFT (Time to First Token)** | **34,449 ms** | **1,430 ms** | **-95.8% (24.1x faster)** |
| Min / Max TTFT | 2,759 ms / 54,860 ms | **733 ms** / 2,373 ms | -73.4% / -95.7% |
| **Avg Turn Total Latency** | **46,053 ms** | **9,698 ms** | **-78.9% (4.75x faster)** |
| Min / Max Total Latency | 8,500 ms / 66,338 ms | 7,312 ms / 12,905 ms | -14.0% / -80.5% |
| **Total LLM Calls (5 turns)** | **50** (10.0 / turn) | **10** (2.0 / turn) | **-80.0%** |
| **Total Tokens (Prompt / Completion)** | **110,796** (75,982 / 34,814) | **14,530** (7,664 / 6,866) | **-86.9%** |
| **Estimated Cost (CNY, 5 turns)** | **¥0.4305** (¥0.0861 / turn) | **¥0.0703** (¥0.0141 / turn) | **-83.7% (6.1x cheaper)** |
| Avg Response Length | 475 chars | 168 chars | More concise |
| Follow-Up Question Rate | 4 / 5 (80%) | **5 / 5 (100%)** | **+20%** |
| Provider Errors / Fallbacks | 0 / 0 | 0 / 0 | Both stable |

---

## 2. Turn-by-Turn Latency Breakdown

| Turn | Scenario | `v1` TTFT | `v2` TTFT | `v1` Total | `v2` Total |
| --- | --- | ---: | ---: | ---: | ---: |
| Turn 1 | Architecture overview | 54,860 ms | 2,373 ms | 66,338 ms | 8,570 ms |
| Turn 2 | Circuit breaker & fallback | 49,334 ms | 1,480 ms | 65,979 ms | 12,905 ms |
| Turn 3 | Cost & caching governance | 30,723 ms | 1,628 ms | 43,850 ms | 9,558 ms |
| Turn 4 | Shallow-answer dodge ("Docker won't crash") | 2,759 ms | **733 ms** | 8,500 ms | 7,312 ms |
| Turn 5 | Redis idempotency implementation | 34,571 ms | **937 ms** | 45,597 ms | 10,143 ms |

---

## 3. Qualitative Findings & Honest Limitations

1. **Stream Integrity Fixed**: `v1 (multi)` still exhibited repeated paragraph prefixes and dropped punctuation across multi-node streaming (`turn-1`, `turn-4`, `turn-5`), whereas `v2 (fast-dual)` delivered clean, uninterrupted token streams on all 5 turns.
2. **Multi-Turn Deep-Dive Quality**: `v2 (fast-dual)` consistently anchored follow-ups to unresolved architectural tensions (e.g., cross-model score comparability during DeepSeek→Qwen fallback, mid-stream SSE failure after 20 flushed tokens, and distinguishing request-level idempotency from stream resume cursors), including catching the candidate's Turn 4 evasion.
3. **Observed Gap to Optimize Next**: Both runs recorded `promptCacheHits: 0` / `cachedTokens: 0` in `session_costs` (`promptCacheMisses: 50` for `v1`, `10` for `v2`). Inspecting DeepSeek's `prompt_cache_hit_tokens` usage mapping into `SessionCost` is a concrete next optimization.
4. **Scope & Acceptance Boundary**: This benchmark verifies real DeepSeek streaming latency, cost, and qualitative follow-up depth on a 5-turn engineering interview. **Whole-product status remains `NOT_ACCEPTED`** until full multi-provider failover bill reconciliation, Qwen embedding credit replenishment, physical-device checks, and production HTTPS deployment are completed.
