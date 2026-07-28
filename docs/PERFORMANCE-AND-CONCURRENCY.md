# Performance & Concurrency Report

Measured results for the real-time interview platform. Every number below was
produced by `evalora-frontend/scripts/load-test.mjs` against the running stack —
nothing here is estimated.

## Test setup

| Item | Value |
|---|---|
| API | NestJS 11, single Node process (`node v24`) |
| Transport | socket.io (WebSocket), namespace `/interview` |
| Database | Neon PostgreSQL, `us-east-1` (remote from the test client) |
| Client | `scripts/load-test.mjs`, one WebSocket per simulated candidate |
| Method | N sessions created in parallel → all sockets connect + join at once → sustained pings → broadcast probe → forced disconnect |

Reproduce with:

```bash
LOAD_TEST_TOKEN=<workspace jwt> LOAD_TEST_TEMPLATE=<templateId> \
  node scripts/load-test.mjs --sessions 50 --pings 10
```

## Results

| Concurrent sessions | Session creation | Per session | WS joins | RTT p50 | RTT p95 | RTT max | Broadcast delivered | Reconnect + resume |
|---|---|---|---|---|---|---|---|---|
| 10 (before fix) | 13 157 ms | 1 316 ms | 10/10 in 1 875 ms | 1 ms | 2 ms | 3 ms | 10/10 | 10/10 |
| 10 (after fix) | 9 158 ms | 916 ms | 10/10 in 1 872 ms | 2 ms | 4 ms | 4 ms | 10/10 | 10/10 |
| 25 | 6 919 ms | 277 ms | 25/25 in 1 892 ms | 3 ms | 5 ms | 5 ms | 10/10 | 10/10 |
| 50 | 10 758 ms | 215 ms | 50/50 in 3 284 ms | 4 ms | 7 ms | 9 ms | 10/10 | 10/10 |

**Reading the numbers**

- **No failures at any level.** 50/50 sessions created, 50/50 sockets joined,
  every broadcast probe delivered, every forced disconnect recovered with a full
  state snapshot.
- **Latency stays flat under load.** p95 round-trip grew only 2 ms → 7 ms while
  concurrency grew 5×; the transport is nowhere near saturation at 50 sockets.
- **Throughput improves with concurrency** (916 → 277 → 215 ms per session)
  because per-request cost is dominated by fixed network round-trips to the
  remote database, which overlap once requests run in parallel.

## Optimization found and applied

**Event-loop blocking in session creation.**

Creating a session provisions an invite-only candidate account. That code hashed
a throwaway password with `bcrypt.hash(..., 12)` on every call. `bcryptjs` is
pure JavaScript, so it **blocks the Node event loop** — under concurrency it
serialized otherwise-parallel requests. The hash was also pointless: candidates
authenticate with their private access code, and `login` rejects the `CANDIDATE`
role outright, so the stored hash can never grant access.

The placeholder hash is now computed **once per process** and reused
(`getInviteOnlyPasswordHash`). Same security posture, none of the per-request CPU.

| Metric (10 concurrent) | Before | After | Change |
|---|---|---|---|
| Total creation time | 13 157 ms | 9 158 ms | **−30 %** |
| Per session | 1 316 ms | 916 ms | **−400 ms** |

## Known remaining cost

Session creation performs ~10 sequential `await`s, each a round trip to Neon in
`us-east-1`. A single `GET /sessions` measures ~1.0 s and `SELECT 1` measures
~790 ms from the test machine, so **network round-trip time dominates**, not
application logic. The realistic fixes, in order of value:

1. Co-locate the API with the database region (removes most of the ~800 ms floor).
2. Collapse the independent lookups in `createSession` into fewer queries /
   `Promise.all` batches.
3. Add connection pooling close to the app (Neon's pooled endpoint is already in
   use; a regional pooler would help further).

This is deployment topology, not an application defect — the same code against a
co-located database would be bounded by the ~200 ms/session throughput already
demonstrated at 50 concurrent.

## Live observability

`GET /api/analytics/system-health` (and the **System Activity** screen) report the
same class of metrics at runtime: connected sockets, active session rooms, join
success rate, events delivered, today's workload, measured database latency, and
dependency status.
