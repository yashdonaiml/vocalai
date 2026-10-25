# ADR-TOOLS-001: Unified Tool Gateway

Status: Accepted (2026-10-05)

## Decision
Every external tool call passes through one gateway. Discovery, approval, attachment, publication and execution permission are separate steps. Policy precedence: platform deny, org, workspace, connector, revision and binding, deployment scope, caller and confirmation.

See docs/specs/tool-gateway.md for the full specification.
