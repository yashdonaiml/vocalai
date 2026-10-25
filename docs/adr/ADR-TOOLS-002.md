# ADR-TOOLS-002: Runtime-evaluated confirmation

Status: Accepted (2026-10-05)

## Decision
Write-class actions are frozen as pending actions. An authoritative caller speech turn is evaluated by the runtime; on confirm the gateway executes the frozen action directly. No token passes through the model.

See docs/specs/tool-gateway.md for the full specification.
