# Guided integrations

The existing `/tools` route now opens task-first setup under **Integrations**. Connections, advanced tools and action history remain on the same page. Existing onboarding and webhook notifications remain unchanged.

Initial tasks use deliberately small HTTP contracts:

| Task                    | Method | Required fields                   | Mapping          |
| ----------------------- | ------ | --------------------------------- | ---------------- |
| Look up a customer      | GET    | email                             | Query parameters |
| Create a support ticket | POST   | name, email, subject, description | JSON body        |
| Save a sales lead       | POST   | name, email, phone, reason        | JSON body        |

These are guided API/automation templates, not native provider integrations. A connected application's endpoint must implement the selected contract, directly or through its automation receiver. No Google OAuth, CRM vendor support, booking guarantee or email delivery is implied. Application-specific sign-in and field mapping can be added behind the same gateway later.

## Customer flow

1. Choose the business task.
2. Select an existing HTTP/automation connection or create one using encrypted credentials. MCP discovery remains under advanced Connections.
3. Supply the action path. Schemas and mappings are generated server-side. Saved tasks can be resumed; changing the action contract creates a new revision through the catalog.
4. A reviewer explicitly authorizes console testing only. The guided test uses normal labeled fields, sends a real request, and records its result through the gateway. Write tests require confirmation and may create actual records. Sample/mock results cannot authorize live use.
5. Live approval checks permissions and a successful real console invocation from the same workspace, tool and current revision in the previous 24 hours. The advanced review endpoint enforces this same evidence requirement for guided actions. Writes retain caller confirmation and automatic retries are disabled in guided approvals. Add the approved action to an agent draft, then use the existing publish/deploy process; approving an action alone does not mutate a live bundle.
6. Action history shows attempts, mode, status and saved responses, with links to call details. The call's Actions tab shows gateway outcomes alongside transcript tool activity. Existing privacy policies and RLS govern all reads.

An HTTP success proves that the receiver accepted the request; the reviewer must inspect the output and verify the expected application result. The implementation does not claim semantic receipt validation for arbitrary third-party APIs.

Tests in `tests/integration-setup.test.cjs` cover scoped configuration, authorization, generated contracts, unsafe paths, stale/foreign/mock/pending evidence rejection, and the advanced-review bypass path. Live third-party application tests require a configured receiver and are not performed automatically during local validation.
