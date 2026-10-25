# Launch batch: outbound request security

Implemented 25 October 2026. Every customer-controlled HTTP destination now uses `guardedFetch` in `src/lib/tools/egress.server.ts`: HTTP/MCP tools and discovery, connector health checks, knowledge URL ingestion, workflow summary/webhook delivery, domain-event delivery and console webhook tests. Fixed AI/carrier API endpoints remain their existing provider/adapter responsibilities.

The guarded transport:

- Accepts HTTPS on port 443 only, without embedded credentials, IP-literal targets or private/internal hostname suffixes.
- Resolves the OS DNS answer set and rejects it if any address is non-public/reserved, including IPv4-mapped/compatible/NAT64 IPv6 and transition addresses.
- Pins the native HTTPS connection's lookup callback to a validated address, with a nonzero family and no connection pool. The original hostname remains the TLS server name and certificate-validation target. No second unvalidated DNS lookup occurs at connection time.
- Rejects redirects and compressed responses. Uses an identity encoding request and bounded response body/header sizes; the deadline includes DNS, connection and body reading. Caller abort propagates and listeners/timers are removed.
- Overrides Host and removes routing/framing/proxy headers supplied by a caller. Tool credentials remain server-provided and are not returned to browsers.
- Conservatively marks a handed-off request as potentially sent. Preconnection address rejection and DNS timeout remain unsent so adapter handling does not infer that a business write succeeded.

Retired `createTool`, `updateTool` and `testTool` server actions fail closed with a migration message. Current Tools UI still uses `tools.functions.ts` and the revision-bound Tool Gateway. The retired functions no longer mutate the legacy tool table or fetch a business URL directly.

## Tests

`node --test tests/launch-security.test.cjs` covers private/reserved/mixed DNS sets, encoded IP URLs, IPv6 mapping/transition forms, trailing-dot hostnames, non-HTTPS ports and URL credentials, original-host TLS plus pinned IP routing, forged headers, public IPv6, redirects, compression, oversized/streamed bodies, DNS/request deadlines, pre-aborted requests, legacy endpoint denial, guarded ingestion, webhook delivery/test and workflow summary failure recording. These mock only DNS/transport/database boundaries; they execute the real server modules. No external request, key, paid operation or live account is needed.

## Operating constraints

Only globally routable IPv6 unicast is supported; special-purpose/transition addresses are deliberately rejected. Redirecting knowledge sites must use their final public HTTPS URL. Servers that insist on compressed responses are rejected. HEAD checks bound actual response bytes while permitting a larger Content-Length describing the resource. DNS failures are closed rather than falling back to another unvalidated path. Underlying OS DNS work may finish after a caller deadline, but cannot start a subsequent connection through this request.

Production should retain network-level egress restrictions as defense in depth. No cloud firewall changes or external deployment were performed in this batch. The transport does not implement later-phase durable event delivery, per-endpoint retry state or workflow outbox transactions; those are separate roadmap work.
