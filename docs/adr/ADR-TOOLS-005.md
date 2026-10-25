# ADR-TOOLS-005: Provider tool schema compiler

Status: Accepted (2026-10-05)

## Decision
Canonical JSON Schema is compiled per model profile; the gateway always validates against the canonical schema, so provider schemas are never the security boundary.

See docs/specs/tool-gateway.md for the full specification.
