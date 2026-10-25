import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "@/lib/notify";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Globe,
  History,
  Plug,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
  Webhook,
  Wrench,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard, PageHeader, Pill, SectionTitle, SystemLabel } from "@/components/apple";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import {
  addConnection,
  addWebTool,
  checkConnection,
  decideAction,
  importOpenApi,
  reviewTool,
  saveMockReply,
  testToolCall,
  updateConnection,
  configureIntegration,
  approveIntegration,
  setAgentTool,
} from "@/lib/tools.functions";
import { INTEGRATION_TASKS, integrationTask } from "@/lib/integration-tasks";

type Connector = {
  id: string;
  display_name: string;
  type: string;
  canonical_origin: string;
  endpoint_path: string;
  health: string;
  admin_enabled: boolean;
  error_code: string | null;
  last_checked_at: string | null;
  environment_class: string;
  sandbox_of: string | null;
  protocol_version: string | null;
};
type Definition = {
  id: string;
  stable_slug: string;
  source_operation_id: string;
  state: string;
  connector_id: string;
  current_revision_id: string | null;
};
type Revision = {
  id: string;
  tool_id: string;
  revision_no: number;
  display_name: string;
  description: string;
  input_schema: unknown;
  adapter_mapping: unknown;
};
type Approval = {
  safe_to_retry?: boolean;
  tool_revision_id: string;
  status: string;
  risk_class: string;
  confirmation_minimum: string;
  allowed_contexts: string[];
  approval_source: string;
  created_at: string;
};
type Invocation = {
  id: string;
  status: string;
  mode: string;
  context_kind: string;
  error_code: string | null;
  latency_ms: number | null;
  started_at: string;
  tool_id: string | null;
  conversation_id: string | null;
  session_id: string | null;
  output_redacted: unknown;
};
type CredentialHint = { connector_id: string; auth_kind: string; hint: string };

const toolsQuery = (ws: string) =>
  queryOptions({
    queryKey: ["tools-gateway", ws],
    queryFn: async () => {
      const [connectors, definitions, revisions, approvals, invocations, credentials] =
        await Promise.all([
          supabase
            .from("tool_connectors")
            .select(
              "id, display_name, type, canonical_origin, endpoint_path, health, admin_enabled, error_code, last_checked_at, environment_class, sandbox_of, protocol_version",
            )
            .eq("workspace_id", ws)
            .is("archived_at", null)
            .order("created_at"),
          supabase
            .from("tool_definitions")
            .select(
              "id, stable_slug, source_operation_id, state, connector_id, current_revision_id",
            )
            .eq("workspace_id", ws)
            .neq("state", "archived")
            .order("created_at"),
          supabase
            .from("tool_revisions")
            .select(
              "id, tool_id, revision_no, display_name, description, input_schema, adapter_mapping",
            )
            .eq("workspace_id", ws),
          supabase
            .from("tool_approvals")
            .select(
              "tool_revision_id, status, risk_class, confirmation_minimum, allowed_contexts, approval_source, created_at",
            )
            .eq("workspace_id", ws)
            .order("created_at", { ascending: false }),
          supabase
            .from("tool_invocations")
            .select(
              "id, status, mode, context_kind, error_code, latency_ms, started_at, tool_id, conversation_id, session_id, output_redacted",
            )
            .eq("workspace_id", ws)
            .order("started_at", { ascending: false })
            .limit(50),
          supabase
            .from("tool_credentials_public")
            .select("connector_id, auth_kind, hint")
            .eq("workspace_id", ws),
        ]);
      const error =
        connectors.error ??
        definitions.error ??
        revisions.error ??
        approvals.error ??
        invocations.error ??
        credentials.error;
      if (error) throw error;
      const latestApproval = new Map<string, Approval>();
      for (const a of (approvals.data ?? []) as Approval[])
        if (!latestApproval.has(a.tool_revision_id)) latestApproval.set(a.tool_revision_id, a);
      return {
        connectors: (connectors.data ?? []) as Connector[],
        definitions: (definitions.data ?? []) as Definition[],
        revisions: (revisions.data ?? []) as Revision[],
        latestApproval,
        invocations: (invocations.data ?? []) as Invocation[],
        credentials: (credentials.data ?? []) as CredentialHint[],
      };
    },
  });

export const Route = createFileRoute("/_authenticated/tools")({
  head: () => ({
    meta: [
      { title: "Tools: VocollAI" },
      {
        name: "description",
        content: "Connect your systems, review and approve tools, test them, and see every call.",
      },
      { property: "og:title", content: "Tools: VocollAI" },
      {
        property: "og:description",
        content: "Connect your systems, review and approve tools, test them, and see every call.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ToolsPage,
});

const sel = "rounded-md border border-input bg-background px-3 py-2 text-sm";
const TABS = [
  { id: "integrations", label: "Set up an action", icon: Plug },
  { id: "connections", label: "Connections", icon: Plug },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "history", label: "Call history", icon: History },
] as const;
type Tab = (typeof TABS)[number]["id"];

function healthTone(h: string): "ok" | "warn" | "muted" {
  if (h === "healthy") return "ok";
  if (h === "not_checked") return "muted";
  return "warn";
}
const HEALTH_LABEL: Record<string, string> = {
  healthy: "Healthy",
  not_checked: "Not checked",
  unreachable: "Unreachable",
  auth_invalid: "Credentials rejected",
  auth_forbidden: "No permission",
  schema_drift: "Changed since approval",
  revoked: "Removed",
};
const RISK_LABEL: Record<string, string> = {
  read: "Read only",
  write: "Changes data",
  sensitive: "Sensitive",
  destructive: "Destructive",
  restricted: "Restricted",
};
const STATUS_LABEL: Record<string, string> = {
  succeeded: "Succeeded",
  failed: "Failed",
  blocked: "Blocked",
  pending_confirmation: "Waiting for confirmation",
  cancelled: "Declined",
  expired: "Expired",
  outcome_unknown: "Outcome unknown",
  running: "Running",
};

function ToolsPage() {
  const ws = useWorkspace();
  const { data } = useSuspenseQuery(toolsQuery(ws.id));
  const [tab, setTab] = useState<Tab>("integrations");
  const pendingCount = data.definitions.filter((d) => {
    const rev = data.revisions.find((r) => r.id === d.current_revision_id);
    return rev && data.latestApproval.get(rev.id)?.status === "pending";
  }).length;

  return (
    <>
      <PageHeader
        eyebrow="Build"
        title="Integrations"
        subtitle="Choose a business task, connect your application, and test the result before approving it for calls."
      />
      <div className="mb-5 flex gap-1 rounded-full border border-border bg-muted p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              tab === t.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
            {t.id === "tools" && pendingCount > 0 && (
              <span className="ml-1 rounded-full bg-warning-soft px-1.5 text-xs font-semibold text-warning">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>
      {tab === "integrations" && (
        <IntegrationSetup key={ws.id} onHistory={() => setTab("history")} />
      )}
      {tab === "connections" && <ConnectionsTab />}
      {tab === "tools" && <ToolsTab />}
      {tab === "history" && <HistoryTab />}
    </>
  );
}

function IntegrationSetup({ onHistory }: { onHistory: () => void }) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(toolsQuery(ws.id));
  const { data: agents } = useSuspenseQuery(
    queryOptions({
      queryKey: ["integration-agents", ws.id],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("agents")
          .select("id,name")
          .eq("workspace_id", ws.id)
          .neq("status", "archived");
        if (error) throw error;
        return data ?? [];
      },
    }),
  );
  const configure = useServerFn(configureIntegration);
  const review = useServerFn(reviewTool);
  const approve = useServerFn(approveIntegration);
  const bind = useServerFn(setAgentTool);
  const [taskId, setTaskId] = useState<string>(INTEGRATION_TASKS[0].id);
  const [connectorId, setConnectorId] = useState("");
  const [path, setPath] = useState("");
  const [toolId, setToolId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [attached, setAttached] = useState(false);
  const [showConnection, setShowConnection] = useState(false);
  const task = integrationTask(taskId);
  const def = data.definitions.find((d) => d.id === toolId);
  const rev = data.revisions.find((r) => r.id === def?.current_revision_id);
  const approval = rev ? data.latestApproval.get(rev.id) : undefined;
  const row =
    def && rev
      ? { def, rev, approval, connector: data.connectors.find((c) => c.id === def.connector_id) }
      : null;
  const live =
    approval?.status === "approved" && approval.allowed_contexts.includes("voice_session");
  const testAccess =
    approval?.status === "approved" && approval.allowed_contexts.includes("console_test");
  const refresh = () => qc.invalidateQueries({ queryKey: ["tools-gateway", ws.id] });
  async function perform(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save action");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <GlassCard>
        <SectionTitle
          title="1. What should your agent do?"
          subtitle="Start with a supported task. Each task uses your connected API or automation receiver."
        />
        <div className="grid gap-3 md:grid-cols-3">
          {INTEGRATION_TASKS.map((t) => (
            <button
              key={t.id}
              disabled={busy}
              aria-pressed={taskId === t.id}
              onClick={() => {
                setTaskId(t.id);
                setToolId("");
                setAttached(false);
              }}
              className={cn(
                "rounded-xl border p-4 text-left",
                taskId === t.id ? "border-primary bg-primary-soft" : "border-border",
              )}
            >
              <p className="font-medium">{t.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
            </button>
          ))}
        </div>
      </GlassCard>
      <GlassCard>
        <SectionTitle
          title="2. Connect your application"
          subtitle="Use an existing connection, or add your application's API or automation endpoint. Direct app sign-in is not available yet."
        />
        <select
          aria-label="Application connection"
          className={cn(sel, "w-full")}
          disabled={busy}
          value={connectorId}
          onChange={(e) => {
            setConnectorId(e.target.value);
            setToolId("");
            setPath("");
            setAttached(false);
          }}
        >
          <option value="">Choose a connection</option>
          {data.connectors
            .filter((c) => ["http", "webhook"].includes(c.type) && c.admin_enabled)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name}
              </option>
            ))}
        </select>
        <Button
          className="mt-3"
          variant="outline"
          onClick={() => setShowConnection(!showConnection)}
        >
          {showConnection ? "Hide connection form" : "Connect an application"}
        </Button>
      </GlassCard>
      {showConnection && (
        <AddConnectionForm
          onDone={() => {
            void refresh();
            setShowConnection(false);
          }}
        />
      )}
      {connectorId && (
        <GlassCard>
          <SectionTitle
            title="3. Configure the action"
            subtitle={`Your endpoint must accept ${task.fields.map((f) => f.label.toLowerCase()).join(", ")}. ${task.method === "GET" ? "Details are sent as query parameters." : "Details are sent as JSON."}`}
          />
          {data.definitions
            .filter(
              (d) => d.connector_id === connectorId && d.source_operation_id === `guided:${taskId}`,
            )
            .map((d) => (
              <Button
                key={d.id}
                className="mb-3"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setToolId(d.id);
                  setPath(
                    (
                      data.revisions.find((r) => r.id === d.current_revision_id)
                        ?.adapter_mapping as { path?: string } | undefined
                    )?.path ?? "",
                  );
                  setAttached(false);
                }}
              >
                Continue saved action
              </Button>
            ))}
          <label className="block text-sm">
            Action endpoint path
            <Input
              className="mt-1"
              aria-label="Action endpoint path"
              placeholder="/api/customers"
              value={path}
              disabled={busy}
              onChange={(e) => {
                setPath(e.target.value);
                setToolId("");
                setAttached(false);
              }}
            />
          </label>
          <p className="mt-2 text-xs text-muted-foreground">
            Use the path supplied by your application or automation provider. Advanced field mapping
            is available under Connections.
          </p>
          <Button
            className="mt-3"
            disabled={busy || !path}
            onClick={() =>
              void perform(async () => {
                const r = await configure({ data: { connectorId, taskId, path } });
                setToolId(r.toolId);
                setAttached(false);
                toast.success("Action saved. Review it for testing next.");
              })
            }
          >
            Save action
          </Button>
        </GlassCard>
      )}
      {row && (
        <GlassCard>
          <SectionTitle
            title="4. Test the action"
            subtitle="Testing sends a real request to your connected application. Use test contact details; write actions may create real records."
          />
          {!testAccess && (
            <Button
              disabled={busy}
              onClick={() =>
                void perform(() =>
                  review({
                    data: {
                      revisionId: row.rev.id,
                      decision: "approve",
                      riskClass: task.risk,
                      confirmation: task.risk === "read" ? "none" : "voice_readback",
                      contexts: ["console_test"],
                      safeToRetry: false,
                    },
                  }),
                )
              }
            >
              Authorize testing only
            </Button>
          )}
          {testAccess && (
            <TestPanel key={row.rev.id} row={row} guided onChanged={() => void refresh()} />
          )}
        </GlassCard>
      )}
      {row && (
        <GlassCard>
          <SectionTitle
            title="5. Approve for live calls"
            subtitle="Review the test result, then approve this action version. A successful real test in the last 24 hours is required. Callers must confirm actions that change data."
          />
          <SystemLabel tone={live ? "ok" : "muted"}>
            {live ? "Approved for calls" : "Awaiting live approval"}
          </SystemLabel>
          {!live && (
            <Button
              className="mt-3 block"
              disabled={busy || !testAccess}
              onClick={() =>
                void perform(async () => {
                  await approve({ data: { toolId: row.def.id } });
                  toast.success("Action approved for calls");
                })
              }
            >
              Approve for live calls
            </Button>
          )}
          {live && (
            <div className="mt-3 flex flex-wrap gap-2">
              <select
                aria-label="Agent to use this action"
                className={sel}
                value={agentId}
                onChange={(e) => {
                  setAgentId(e.target.value);
                  setAttached(false);
                }}
              >
                <option value="">Choose an agent</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <Button
                disabled={busy || !agentId}
                onClick={() =>
                  void perform(async () => {
                    await bind({ data: { agentId, toolId: row.def.id, on: true } });
                    setAttached(true);
                  })
                }
              >
                Add to agent draft
              </Button>
            </div>
          )}
          {attached && (
            <p className="mt-3 text-sm">
              Added to the agent draft. Publish and deploy the agent from its studio to use this
              action in live calls.
            </p>
          )}
        </GlassCard>
      )}
      <GlassCard>
        <SectionTitle
          title="6. See what happened"
          subtitle="Action history shows tests and live outcomes separately. Call details include the actions taken during that conversation."
        />
        <Button variant="outline" onClick={onHistory}>
          View action history
        </Button>
      </GlassCard>
    </div>
  );
}

/* ---------------- Connections ---------------- */

function ConnectionsTab() {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(toolsQuery(ws.id));
  const refresh = () => qc.invalidateQueries({ queryKey: ["tools-gateway"] });
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        <AddConnectionForm onDone={refresh} />
        <WebToolGuide />
      </div>
      <GlassCard>
        <SectionTitle
          title="Your connections"
          subtitle="Web APIs, MCP servers and automation webhooks."
        />
        {data.connectors.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No connections yet. Add one using the form.
          </p>
        )}
        <div className="divide-y divide-border">
          {data.connectors.map((c) => (
            <ConnectorRow
              key={c.id}
              connector={c}
              credential={data.credentials.find((cr) => cr.connector_id === c.id)}
              onChanged={refresh}
            />
          ))}
        </div>
      </GlassCard>
    </div>
  );
}

function AddConnectionForm({ onDone }: { onDone: () => void }) {
  const ws = useWorkspace();
  const add = useServerFn(addConnection);
  const [f, setF] = useState({
    type: "http" as "http" | "mcp" | "webhook",
    name: "",
    url: "",
    authKind: "none" as "none" | "bearer" | "basic" | "header" | "query",
    headerName: "",
    secret: "",
  });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const auth =
        f.authKind === "none" || !f.secret
          ? undefined
          : {
              kind: f.authKind,
              secret: f.secret,
              ...(f.headerName ? { headerName: f.headerName } : {}),
            };
      const r = await add({
        data: {
          workspaceId: ws.id,
          type: f.type,
          name: f.name,
          url: f.url,
          ...(auth ? { auth } : {}),
        },
      });
      if (r.error) toast.error(r.error);
      else if (r.found > 0)
        toast.success(`Connection added. Found ${r.found} tools, review them on the Tools tab.`);
      else toast.success("Connection added");
      setF({ type: "http", name: "", url: "", authKind: "none", headerName: "", secret: "" });
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the connection");
    }
    setBusy(false);
  }

  return (
    <GlassCard>
      <SectionTitle
        title="Add a connection"
        subtitle="The address must be a public https address. Keys and tokens go in the credentials field, never in the address."
      />
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["http", "Web API", Globe],
              ["mcp", "MCP server", Server],
              ["webhook", "Automation", Webhook],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              type="button"
              key={v}
              onClick={() => setF({ ...f, type: v })}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-medium",
                f.type === v
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
        <Input
          required
          placeholder="Name, for example Booking system"
          aria-label="Connection name"
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
        />
        <Input
          required
          type="url"
          placeholder={f.type === "mcp" ? "https://mcp.example.com/mcp" : "https://api.example.com"}
          aria-label="Address"
          value={f.url}
          onChange={(e) => setF({ ...f, url: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            className={sel}
            aria-label="Credential type"
            value={f.authKind}
            onChange={(e) => setF({ ...f, authKind: e.target.value as typeof f.authKind })}
          >
            <option value="none">No credentials</option>
            <option value="bearer">Bearer token</option>
            <option value="basic">Basic auth</option>
            <option value="header">Header key</option>
            <option value="query">Query key</option>
          </select>
          {(f.authKind === "header" || f.authKind === "query") && (
            <Input
              placeholder={
                f.authKind === "header"
                  ? "Header name, for example X-API-Key"
                  : "Query name, for example api_key"
              }
              aria-label="Credential name"
              value={f.headerName}
              onChange={(e) => setF({ ...f, headerName: e.target.value })}
            />
          )}
        </div>
        {f.authKind !== "none" && (
          <Input
            required
            type="password"
            placeholder={f.authKind === "basic" ? "user:password" : "Token or key"}
            aria-label="Credential secret"
            value={f.secret}
            onChange={(e) => setF({ ...f, secret: e.target.value })}
          />
        )}
        <Button type="submit" disabled={busy} className="w-full rounded-full">
          {busy ? "Adding" : "Add connection"}
        </Button>
      </form>
    </GlassCard>
  );
}

function WebToolGuide() {
  const [open, setOpen] = useState(false);
  return (
    <GlassCard>
      <button
        className="flex w-full items-center justify-between text-left"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="text-sm font-semibold">Setting up a web tool</span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && (
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            Add a Web API connection with the base address of your system, for example
            https://api.example.com.
          </li>
          <li>
            If the API needs a key, save it as credentials on the connection. It is stored encrypted
            and never shown again.
          </li>
          <li>
            Add each action as a tool: either import the API description (OpenAPI JSON) or add it by
            hand with a method, path and inputs.
          </li>
          <li>Review each tool on the Tools tab. Nothing runs before a person approves it.</li>
          <li>
            Test with a sample reply first, then live. Calls that change data ask for confirmation
            before they run.
          </li>
          <li>
            If your system has no API, use an Automation connection and point it at a Zapier, Make
            or n8n webhook instead.
          </li>
        </ol>
      )}
    </GlassCard>
  );
}

function ConnectorRow({
  connector: c,
  credential,
  onChanged,
}: {
  connector: Connector;
  credential: CredentialHint | undefined;
  onChanged: () => void;
}) {
  const update = useServerFn(updateConnection);
  const check = useServerFn(checkConnection);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
    setBusy(false);
  }

  return (
    <div className="py-3 text-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{c.display_name}</p>
            <SystemLabel tone={healthTone(c.health)}>
              {HEALTH_LABEL[c.health] ?? c.health}
            </SystemLabel>
            {!c.admin_enabled && <Pill tone="muted">Paused</Pill>}
            {c.environment_class === "sandbox" && <Pill tone="info">Sandbox</Pill>}
          </div>
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {c.type === "mcp" ? "MCP" : c.type === "webhook" ? "Automation" : "Web API"} ·{" "}
            {c.canonical_origin}
            {c.endpoint_path !== "/" ? c.endpoint_path : ""}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {credential ? `Credentials ${credential.hint}` : "No credentials"}
            {c.last_checked_at ? ` · checked ${new Date(c.last_checked_at).toLocaleString()}` : ""}
          </p>
        </div>
        <button
          aria-label={`Check ${c.display_name}`}
          title="Check now"
          className="text-muted-foreground hover:text-primary"
          disabled={busy}
          onClick={() =>
            act(async () => {
              const r = await check({ data: { connectorId: c.id } });
              if (r.kind === "discovery")
                toast.success(`Found ${r.added} new, ${r.changed} changed, ${r.removed} removed`);
            }, "Connection checked")
          }
        >
          <RefreshCw className="h-4 w-4" />
        </button>
        <button
          aria-label={`Settings for ${c.display_name}`}
          className="text-muted-foreground hover:text-primary"
          onClick={() => setOpen(!open)}
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-3 rounded-xl bg-muted p-3">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                act(
                  () => update({ data: { connectorId: c.id, enabled: !c.admin_enabled } }),
                  c.admin_enabled ? "Connection paused" : "Connection resumed",
                )
              }
            >
              {c.admin_enabled ? "Pause" : "Resume"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={busy}
              onClick={() => {
                if (confirm(`Remove "${c.display_name}"? Its tools stop working immediately.`))
                  void act(
                    () => update({ data: { connectorId: c.id, remove: true } }),
                    "Connection removed",
                  );
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </Button>
          </div>
          <RotateCredential connectorId={c.id} onDone={onChanged} />
          {c.type !== "mcp" && (
            <ConnectorTools connectorId={c.id} type={c.type} onDone={onChanged} />
          )}
        </div>
      )}
    </div>
  );
}

function RotateCredential({ connectorId, onDone }: { connectorId: string; onDone: () => void }) {
  const update = useServerFn(updateConnection);
  const [f, setF] = useState({
    kind: "bearer" as "bearer" | "basic" | "header" | "query",
    headerName: "",
    secret: "",
  });
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await update({
        data: {
          connectorId,
          auth: {
            kind: f.kind,
            secret: f.secret,
            ...(f.headerName ? { headerName: f.headerName } : {}),
          },
        },
      });
      toast.success("Credentials updated");
      setF({ kind: "bearer", headerName: "", secret: "" });
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the credentials");
    }
    setBusy(false);
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Replace credentials</p>
      <div className="grid grid-cols-2 gap-2">
        <select
          className={sel}
          aria-label="Credential type"
          value={f.kind}
          onChange={(e) => setF({ ...f, kind: e.target.value as typeof f.kind })}
        >
          <option value="bearer">Bearer token</option>
          <option value="basic">Basic auth</option>
          <option value="header">Header key</option>
          <option value="query">Query key</option>
        </select>
        {(f.kind === "header" || f.kind === "query") && (
          <Input
            placeholder="Name"
            aria-label="Credential name"
            value={f.headerName}
            onChange={(e) => setF({ ...f, headerName: e.target.value })}
          />
        )}
      </div>
      <div className="flex gap-2">
        <Input
          required
          type="password"
          placeholder="New token or key"
          aria-label="New credential"
          value={f.secret}
          onChange={(e) => setF({ ...f, secret: e.target.value })}
        />
        <Button size="sm" type="submit" disabled={busy}>
          Save
        </Button>
      </div>
    </form>
  );
}

function ConnectorTools({
  connectorId,
  type,
  onDone,
}: {
  connectorId: string;
  type: string;
  onDone: () => void;
}) {
  const addTool = useServerFn(addWebTool);
  const importSpec = useServerFn(importOpenApi);
  const [mode, setMode] = useState<"none" | "manual" | "import">("none");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    name: "",
    description: "",
    method: "GET" as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: "/",
    inputSchema: '{\n  "type": "object",\n  "properties": {}\n}',
  });
  const [spec, setSpec] = useState("");

  async function submitManual(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await addTool({ data: { connectorId, ...f } });
      toast.success("Tool added. Review it on the Tools tab.");
      setMode("none");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the tool");
    }
    setBusy(false);
  }
  async function submitImport(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await importSpec({ data: { connectorId, spec } });
      toast.success(`Imported ${r.added} new, ${r.changed} changed, ${r.skipped} skipped`);
      setMode("none");
      setSpec("");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not import");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setMode(mode === "manual" ? "none" : "manual")}
        >
          Add a tool by hand
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setMode(mode === "import" ? "none" : "import")}
        >
          Import API description
        </Button>
      </div>
      {type === "webhook" && (
        <p className="text-xs text-muted-foreground">
          For Zapier, Make or n8n: paste the webhook address as the connection, then add one tool
          per action with method POST.
        </p>
      )}
      {mode === "manual" && (
        <form onSubmit={submitManual} className="space-y-2">
          <Input
            required
            className="font-mono"
            placeholder="check_availability"
            aria-label="Tool name"
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value.toLowerCase() })}
          />
          <Input
            required
            placeholder="What it does: the model reads this"
            aria-label="Description"
            value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })}
          />
          <div className="grid grid-cols-[110px_1fr] gap-2">
            <select
              className={sel}
              aria-label="Method"
              value={f.method}
              onChange={(e) => setF({ ...f, method: e.target.value as typeof f.method })}
            >
              <option>GET</option>
              <option>POST</option>
              <option>PUT</option>
              <option>PATCH</option>
              <option>DELETE</option>
            </select>
            <Input
              required
              placeholder="/v1/availability/{date}"
              aria-label="Path"
              value={f.path}
              onChange={(e) => setF({ ...f, path: e.target.value })}
            />
          </div>
          <Textarea
            rows={5}
            className="bg-background font-mono text-xs"
            aria-label="Inputs JSON Schema"
            value={f.inputSchema}
            onChange={(e) => setF({ ...f, inputSchema: e.target.value })}
          />
          <Button size="sm" type="submit" disabled={busy}>
            Add tool
          </Button>
        </form>
      )}
      {mode === "import" && (
        <form onSubmit={submitImport} className="space-y-2">
          <Textarea
            required
            rows={6}
            className="bg-background font-mono text-xs"
            placeholder='Paste the OpenAPI description as JSON, for example {"openapi":"3.0.0","paths":{...}}'
            aria-label="OpenAPI JSON"
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
          />
          <Button size="sm" type="submit" disabled={busy}>
            Import
          </Button>
        </form>
      )}
    </div>
  );
}

/* ---------------- Tools (review + test) ---------------- */

type ToolRow = {
  def: Definition;
  rev: Revision;
  approval: Approval | undefined;
  connector: Connector | undefined;
};

function ToolsTab() {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(toolsQuery(ws.id));
  const refresh = () => qc.invalidateQueries({ queryKey: ["tools-gateway"] });
  const rows: ToolRow[] = data.definitions
    .map((def) => ({
      def,
      rev: data.revisions.find((r) => r.id === def.current_revision_id)!,
      approval: def.current_revision_id
        ? data.latestApproval.get(def.current_revision_id)
        : undefined,
      connector: data.connectors.find((c) => c.id === def.connector_id),
    }))
    .filter((r) => r.rev);

  return (
    <GlassCard>
      <SectionTitle
        title="Tools"
        subtitle="Every tool runs only after a person approves it. If a tool changes, it waits for a fresh review."
      />
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No tools yet. Add a connection first, then add tools by hand, import an API description,
          or connect an MCP server that lists its own.
        </p>
      )}
      <div className="divide-y divide-border">
        {rows.map((r) => (
          <ToolCard key={r.def.id} row={r} onChanged={refresh} />
        ))}
      </div>
    </GlassCard>
  );
}

function ToolCard({ row, onChanged }: { row: ToolRow; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const status = row.approval?.status ?? "pending";
  return (
    <div className="py-3 text-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-primary">{row.def.stable_slug}</p>
            {status === "pending" && (
              <Pill tone="warning" dot>
                Needs review
              </Pill>
            )}
            {status === "approved" && <Pill tone="success">Approved</Pill>}
            {status === "rejected" && <Pill tone="destructive">Rejected</Pill>}
            {status === "revoked" && <Pill tone="muted">Turned off</Pill>}
            {row.approval && (
              <Pill tone="muted">
                {RISK_LABEL[row.approval.risk_class] ?? row.approval.risk_class}
              </Pill>
            )}
            {row.approval?.approval_source === "legacy" && <Pill tone="info">Migrated</Pill>}
          </div>
          <p className="mt-1 text-muted-foreground">{row.rev.description}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Version {row.rev.revision_no}
            {row.connector ? ` · ${row.connector.display_name}` : ""}
            {row.approval?.status === "approved" &&
              ` · confirmation: ${row.approval.confirmation_minimum === "none" ? "not required" : row.approval.confirmation_minimum === "voice" ? "ask the caller" : "read back details"}`}
          </p>
        </div>
        <button
          aria-label={`Open ${row.def.stable_slug}`}
          className="text-muted-foreground hover:text-primary"
          onClick={() => setOpen(!open)}
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open && <ToolDetail row={row} onChanged={onChanged} />}
    </div>
  );
}

function ToolDetail({ row, onChanged }: { row: ToolRow; onChanged: () => void }) {
  const review = useServerFn(reviewTool);
  const saveMock = useServerFn(saveMockReply);
  const [busy, setBusy] = useState(false);
  const a = row.approval;
  const [f, setF] = useState({
    riskClass: (a?.risk_class ?? "read") as
      "read" | "write" | "sensitive" | "destructive" | "restricted",
    confirmation: (a?.confirmation_minimum ?? "none") as "none" | "voice" | "voice_readback",
    contexts: (a?.allowed_contexts?.length
      ? a.allowed_contexts
      : ["voice_session", "text_test", "workflow", "console_test"]) as (
      "voice_session" | "text_test" | "workflow" | "console_test"
    )[],
    safeToRetry: a?.safe_to_retry ?? false,
  });
  const [mock, setMock] = useState('{\n  "ok": true\n}');

  async function decide(decision: "approve" | "reject" | "revoke") {
    setBusy(true);
    try {
      await review({ data: { revisionId: row.rev.id, decision, ...f } });
      toast.success(
        decision === "approve"
          ? "Tool approved"
          : decision === "reject"
            ? "Tool rejected"
            : "Tool turned off",
      );
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the review");
    }
    setBusy(false);
  }
  async function submitMock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await saveMock({ data: { revisionId: row.rev.id, reply: mock } });
      toast.success("Sample reply saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the sample reply");
    }
    setBusy(false);
  }

  const CTX_LABEL: Record<string, string> = {
    voice_session: "Live calls",
    text_test: "Test chat",
    workflow: "Workflows",
    console_test: "Tools page tests",
  };
  return (
    <div className="mt-3 grid gap-4 rounded-xl bg-muted p-4 lg:grid-cols-2">
      <div className="space-y-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          <ShieldCheck className="h-3.5 w-3.5" /> Review
        </p>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs text-muted-foreground">
            What it can do
            <select
              className={cn(sel, "w-full")}
              value={f.riskClass}
              onChange={(e) => setF({ ...f, riskClass: e.target.value as typeof f.riskClass })}
            >
              <option value="read">Read only</option>
              <option value="write">Changes data</option>
              <option value="sensitive">Sensitive data</option>
              <option value="destructive">Destructive</option>
              <option value="restricted">Restricted, never runs</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Confirmation
            <select
              className={cn(sel, "w-full")}
              value={f.confirmation}
              onChange={(e) =>
                setF({ ...f, confirmation: e.target.value as typeof f.confirmation })
              }
            >
              <option value="none">Not required</option>
              <option value="voice">Ask the caller</option>
              <option value="voice_readback">Read back details first</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          {Object.entries(CTX_LABEL).map(([v, label]) => (
            <label key={v} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={f.contexts.includes(v as never)}
                onChange={(e) =>
                  setF({
                    ...f,
                    contexts: e.target.checked
                      ? [...f.contexts, v as never]
                      : f.contexts.filter((c) => c !== v),
                  })
                }
              />
              {label}
            </label>
          ))}
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={f.safeToRetry}
              onChange={(e) => setF({ ...f, safeToRetry: e.target.checked })}
            />
            Safe to retry automatically
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="rounded-full"
            disabled={busy}
            onClick={() => decide("approve")}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Approve
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => decide("reject")}>
            <XCircle className="h-3.5 w-3.5" /> Reject
          </Button>
          {a?.status === "approved" && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={busy}
              onClick={() => decide("revoke")}
            >
              Turn off
            </Button>
          )}
        </div>
        <form onSubmit={submitMock} className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Sample reply for mock tests</p>
          <Textarea
            rows={3}
            className="bg-background font-mono text-xs"
            aria-label="Sample reply"
            value={mock}
            onChange={(e) => setMock(e.target.value)}
          />
          <Button size="sm" variant="outline" type="submit" disabled={busy}>
            Save sample reply
          </Button>
        </form>
      </div>
      <TestPanel row={row} />
    </div>
  );
}

function sampleFromSchema(schema: unknown): string {
  try {
    const props =
      (schema as { properties?: Record<string, { type?: string; enum?: unknown[] }> }).properties ??
      {};
    const sample: Record<string, unknown> = {};
    for (const [key, def] of Object.entries(props)) {
      if (def.enum?.length) sample[key] = def.enum[0];
      else if (def.type === "number" || def.type === "integer") sample[key] = 1;
      else if (def.type === "boolean") sample[key] = true;
      else if (def.type === "array") sample[key] = [];
      else sample[key] = "example";
    }
    return JSON.stringify(sample, null, 2);
  } catch {
    return "{}";
  }
}

function TestPanel({
  row,
  guided = false,
  onChanged,
}: {
  row: ToolRow;
  guided?: boolean;
  onChanged?: () => void;
}) {
  const ws = useWorkspace();
  const test = useServerFn(testToolCall);
  const decide = useServerFn(decideAction);
  const [mode, setMode] = useState<"mock" | "sandbox" | "live">(guided ? "live" : "mock");
  const [input, setInput] = useState(() => sampleFromSchema(row.rev.input_schema));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    status: string;
    output: unknown;
    error: { safeMessage: string } | null;
    confirmation: { id: string; summary: string } | null;
    durationMs: number;
  } | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      setResult(await test({ data: { workspaceId: ws.id, toolId: row.def.id, mode, input } }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test failed");
    }
    onChanged?.();
    setBusy(false);
  }
  async function decidePending(decision: "confirm" | "deny") {
    if (!result?.confirmation) return;
    setBusy(true);
    try {
      const r = await decide({
        data: { workspaceId: ws.id, pendingActionId: result.confirmation.id, decision },
      });
      setResult({
        status: r.status,
        output: r.output ?? null,
        error: r.error ?? null,
        confirmation: null,
        durationMs: r.durationMs,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not decide");
    }
    onChanged?.();
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold">Test</p>
      {!guided && (
        <div className="flex gap-1 rounded-full border border-border bg-background p-1 w-fit">
          {(
            [
              ["mock", "Sample reply"],
              ["sandbox", "Sandbox"],
              ["live", "Live"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setMode(v)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium",
                mode === v
                  ? "bg-primary-soft text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {mode === "sandbox" && (
        <p className="text-xs text-muted-foreground">
          Sandbox sends the call to the sandbox copy of this connection, if one is linked.
        </p>
      )}
      {mode === "live" && (
        <p className="text-xs text-muted-foreground">
          Live sends a real call to your system. Actions that change data ask for confirmation
          first.
        </p>
      )}
      {guided ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(
            (row.rev.input_schema as { properties?: Record<string, { description?: string }> })
              .properties ?? {},
          ).map(([name, field]) => (
            <label key={name} className="text-sm">
              {field.description ?? name}
              <Input
                disabled={busy}
                value={String(JSON.parse(input)[name] ?? "")}
                onChange={(e) =>
                  setInput(JSON.stringify({ ...JSON.parse(input), [name]: e.target.value }))
                }
              />
            </label>
          ))}
        </div>
      ) : (
        <Textarea
          rows={4}
          className="bg-background font-mono text-xs"
          aria-label="Test input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
      )}
      <div className="flex gap-2">
        <Button size="sm" className="rounded-full" disabled={busy} onClick={run}>
          {busy ? "Calling" : "Run test"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setInput(sampleFromSchema(row.rev.input_schema))}
        >
          Fill from inputs
        </Button>
      </div>
      {result && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <SystemLabel
              tone={
                result.status === "succeeded"
                  ? "ok"
                  : result.status === "pending_confirmation"
                    ? "warn"
                    : result.status === "failed" || result.status === "blocked"
                      ? "warn"
                      : "muted"
              }
            >
              {STATUS_LABEL[result.status] ?? result.status}
            </SystemLabel>
            <span className="font-mono text-xs text-muted-foreground">{result.durationMs}ms</span>
          </div>
          {result.confirmation && (
            <div className="space-y-2 rounded-lg border border-warning/40 bg-warning-soft p-3">
              <p className="text-xs font-medium">{result.confirmation.summary}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="rounded-full"
                  disabled={busy}
                  onClick={() => decidePending("confirm")}
                >
                  Confirm
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => decidePending("deny")}
                >
                  Deny
                </Button>
              </div>
            </div>
          )}
          <pre className="max-h-48 overflow-auto rounded-lg bg-background p-2 font-mono text-xs">
            {result.error
              ? result.error.safeMessage
              : JSON.stringify(result.output ?? "Empty response", null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ---------------- Call history ---------------- */

function HistoryTab() {
  const ws = useWorkspace();
  const { data } = useSuspenseQuery(toolsQuery(ws.id));
  const nameOf = (id: string | null) =>
    data.definitions.find((d) => d.id === id)?.stable_slug ?? "unknown";
  const CTX: Record<string, string> = {
    voice_session: "Live call",
    text_test: "Test chat",
    workflow: "Workflow",
    console_test: "Tools page",
  };
  return (
    <GlassCard>
      <SectionTitle
        title="Action history"
        subtitle="The 50 most recent action attempts, including tests. Open a result to inspect the saved response."
      />
      {data.invocations.length === 0 && (
        <p className="text-sm text-muted-foreground">No calls yet. Test a tool to see it here.</p>
      )}
      {data.invocations.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Tool</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Where</th>
                <th className="py-2 pr-4 font-medium">Mode</th>
                <th className="py-2 pr-4 font-medium">Time</th>
                <th className="py-2 font-medium">When</th>
                <th className="py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.invocations.map((i) => (
                <tr key={i.id}>
                  <td className="py-2 pr-4 font-mono text-primary">{nameOf(i.tool_id)}</td>
                  <td className="py-2 pr-4">
                    <SystemLabel
                      tone={
                        i.status === "succeeded"
                          ? "ok"
                          : i.status === "failed" ||
                              i.status === "blocked" ||
                              i.status === "outcome_unknown"
                            ? "warn"
                            : "muted"
                      }
                    >
                      {STATUS_LABEL[i.status] ?? i.status}
                    </SystemLabel>
                    {i.error_code && (
                      <span className="ml-2 text-xs text-muted-foreground">{i.error_code}</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {CTX[i.context_kind] ?? i.context_kind}
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">{i.mode}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                    {i.latency_ms != null ? `${i.latency_ms}ms` : ""}
                  </td>
                  <td className="py-2 text-xs text-muted-foreground">
                    {new Date(i.started_at).toLocaleString()}
                  </td>
                  <td className="py-2">
                    <details>
                      <summary className="cursor-pointer text-primary">View result</summary>
                      <pre className="max-h-48 max-w-sm overflow-auto whitespace-pre-wrap p-2 text-xs">
                        {JSON.stringify(
                          i.output_redacted ?? { status: i.status, error: i.error_code },
                          null,
                          2,
                        )}
                      </pre>
                      {(i.conversation_id ||
                        (i.context_kind === "voice_session" && i.session_id)) && (
                        <Link
                          to="/conversations/$id"
                          params={{ id: i.conversation_id || i.session_id! }}
                          className="text-primary"
                        >
                          Open call
                        </Link>
                      )}
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  );
}
