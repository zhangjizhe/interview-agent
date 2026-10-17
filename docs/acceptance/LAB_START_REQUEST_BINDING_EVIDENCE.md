# Builder start request binding

Scope: START-REQUEST-BINDING, internal prerelease; overall NOT_ACCEPTED.

Matching the Agent and version alone could accept another historical run for the same target. Before the start POST, the Builder now captures the exact message and idempotency key. The existing persisted-run GET must also match that key, the input message and application `lab-draft-test` before reporting success. Input must be a non-null object, not an array; the original message is compared without trimming. Failure preserves the previous run/input/confirmation and same request key for explicit verification/retry. No automatic replay is added.

No API, schema, permissions, gateway or billing changes; this adds comparisons to the already required metadata read, not another GET or model call. The server already stores the original input/key/application and validates its request hash on key reuse. This checks the returned run's request association, not model output correctness or every historical record.

Verification:

- Five regressions fail against previous code with73 cases passing. Fixed78/78, relevant ESLint and Lab TypeScript/build pass.
- Browser extends the existing actual reused202/GET200 scenario with a corrupted request key; actual original key/input/application are verified before corruption, followed by explicit correct same-key recovery. Model/ledger aggregates must remain unchanged. Version mismatch coverage remains.
- First complete isolated chain exits0: API82/82, full browser including real GET request-key corruption and correct same-key recovery, strict PostgreSQL schema/row-multiset/sequence equality and actual Milvus question/Qdrant vector-payload restore pass. No provider/ledger increment in the added metadata scenario. Lab image `sha256:6bf77aee0c19aadd44c22f23e3021f155cb53993fba6229b122ca9fa8191acf0`. Independent test Agent final implementation/browser/inventory review found no new blockers; same983 templates/102Builder nodes and original reviews retained. Diff check passes. Stage checks passed; exact-head CI and PR merge remain pending.

External model cost0 using offline fixture; whole-chain synthetic calls and ledger entries are retained. Real quality, historical unknown billing, legacy question ownership and deployment remain open. Inventory983 final verdicts remain NOT_ACCEPTED.
