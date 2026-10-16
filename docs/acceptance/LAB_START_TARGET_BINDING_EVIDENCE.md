# Builder start target binding

Scope: START-TARGET-BINDING, internal prerelease, overall NOT_ACCEPTED.

The existing202 start receipt contains only run ID/status/reused and cannot establish Agent/version ownership. The Builder now captures the submitted Agent and version before the POST, reads the returned run through the existing tenant/workspace-authorized GET endpoint, and checks run ID, Agent ID and version ID before selecting the run or reporting success. Readback failure or mismatch reports the existing unknown-start message and retains the previous run, confirmation, input and request key for explicit verification/retry. No automatic POST or model invocation is added. Context remains locked until the readback ends.

No server API/schema/permission/billing changes. One metadata GET is added after each shape-valid start response. Queue status can advance between POST and GET, so equality of their statuses is not required. This stage verifies Agent/version binding only; it does not compare the persisted requestKey/input and must not be described as complete request correlation.

Verification:

- Five wrong/missing ID/Agent/version cases fail against previous code. Fixed73/73 component cases pass, including transport rejection cases labelled403/404/503 with explicit same-key retry. These are component simulations, not real browser HTTP error responses. Relevant ESLint, Lab TypeScript/build, helper syntax and diff checks pass.
- Browser forwards an actual reused202 and actual GET200, then changes the readback version in transit. It must show unknown result, retain the previous run/input/confirmation, preserve the same key on explicit retry, and leave model/ledger aggregates unchanged. Later held real retry must restore the correct run.
- First full isolated API/browser/persistence/strict restore chain exits0: API82/82, all browser scenarios including the new mismatched readback and subsequent real same-key recovery, PostgreSQL schema/row-multiset/sequence equality, actual Milvus question and Qdrant vector/payload restore pass. Lab image `sha256:ccefc4221d09acccce4294dee24d8a9bccbf9a0da0ae43a41a8ddfbc1e1c499f`. Stage checks passed; exact-head CI and PR merge remain pending.

Independent test Agent reviewed implementation, tests, browser-helper and inventory983/102Builder mapping with old reviews preserved; no blocking findings. Only offline synthetic providers are used, external cost0; unrelated pre-existing calls and ledger entries must not be reported as absent. Real quality, historical unknown bills, legacy question ownership and deployment remain unresolved. Inventory983 final verdicts remain NOT_ACCEPTED.
