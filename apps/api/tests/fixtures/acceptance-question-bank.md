# TypeScript and Distributed Systems Interview Questions

## Event Loop

Question: Explain the Node.js event loop and the relationship between microtasks,
macrotasks, and I/O callbacks.

Answer: The event loop advances through phases. Promise callbacks run in the
microtask queue before the next macrotask. I/O callbacks are scheduled in the
poll phase, while timers run in the timer phase.

Tags: Node.js, event loop, concurrency

## Cache Consistency

Question: How would you prevent stale cache reads after updating PostgreSQL data?

Answer: Use cache-aside with explicit invalidation after a committed write, add
versioned cache keys where appropriate, and protect hot keys against stampedes.

Tags: Redis, PostgreSQL, cache consistency
