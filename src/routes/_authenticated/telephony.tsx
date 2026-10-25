import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "@/lib/notify";
import { Phone, Radio, Route as RouteIcon, Trash2 } from "lucide-react";
import { ManagedInbound } from "@/components/managed-inbound";
import { GlassCard, PageHeader, SystemLabel } from "@/components/apple";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import {
  addPhoneNumber,
  retryPhoneNumber,
  updatePhoneRoute,
  removePhoneNumber,
  getPhoneServiceSetup,
} from "@/lib/telephony.functions";
const sel = "rounded-md border border-input bg-background px-3 py-2 text-sm";
const telephonyQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ["telephony", workspaceId],
    refetchInterval: 15000,
    queryFn: async () => {
      const results = await Promise.all([
        supabase
          .from("phone_numbers")
          .select(
            "id, e164, carrier, management_mode, verified_at, agent_id, environment_id, status, sip_trunk_ref, dispatch_rule_ref, provisioning_error, last_call_at",
          )
          .eq("workspace_id", workspaceId)
          .order("created_at"),
        supabase
          .from("agents")
          .select("id, name")
          .eq("workspace_id", workspaceId)
          .neq("status", "archived"),
        supabase.from("environments").select("id, name, kind").eq("workspace_id", workspaceId),
        supabase
          .from("deployments")
          .select("agent_id, environment_id, agent_version")
          .eq("workspace_id", workspaceId)
          .eq("status", "active")
          .eq("canary_percent", 100),
      ]);
      for (const result of results)
        if (result.error)
          throw new Error(
            "Could not load phone routes. Check that the latest database migrations are applied.",
          );
      const [{ data: numbers }, { data: agents }, { data: environments }, { data: deps }] = results;
      return {
        numbers: numbers ?? [],
        agents: agents ?? [],
        environments: environments ?? [],
        deps: deps ?? [],
      };
    },
  });
export const Route = createFileRoute("/_authenticated/telephony")({
  head: () => ({
    meta: [
      { title: "Telephony and channels: VocollAI" },
      {
        name: "description",
        content:
          "Add phone numbers, route them to agents and environments, and check channel readiness.",
      },
      { property: "og:title", content: "Telephony and channels: VocollAI" },
      {
        property: "og:description",
        content:
          "Add phone numbers, route them to agents and environments, and check channel readiness.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Telephony,
});
function Telephony() {
  const workspace = useWorkspace();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(telephonyQuery(workspace.id));
  const addNumber = useServerFn(addPhoneNumber);
  const [num, setNum] = useState({
    e164: "",
    carrier: "telnyx" as "twilio" | "telnyx" | "other",
    agentId: "",
    environmentId: "",
  });
  const [busy, setBusy] = useState<string | null>(null);
  const setupFn = useServerFn(getPhoneServiceSetup);
  const { data: setup } = useQuery({
    queryKey: ["phone-service-setup", workspace.id],
    queryFn: () => setupFn(),
    staleTime: 30_000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["telephony"] });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy("add");
    try {
      const r = await addNumber({ data: { workspaceId: workspace.id, ...num } });
      if (r.provisioned)
        toast.success(
          "Route configured. Connect the number at your carrier, then make a test call.",
        );
      else
        toast.error(r.error ?? "Number saved. Retry routing after configuring the voice service.");
      setNum({ ...num, e164: "" });
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add number");
    } finally {
      setBusy(null);
      refresh();
    }
  }
  async function reroute(id: string, patch: { agent_id?: string; environment_id?: string }) {
    const number = data.numbers.find((n) => n.id === id);
    if (!number) return;
    setBusy(id);
    try {
      await updatePhoneRoute({
        data: {
          workspaceId: workspace.id,
          numberId: id,
          agentId: patch.agent_id ?? number.agent_id ?? "",
          environmentId: patch.environment_id ?? number.environment_id ?? "",
        },
      });
      toast.success("Routing updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update routing");
    } finally {
      setBusy(null);
      refresh();
    }
  }
  async function retry(id: string) {
    setBusy(id);
    try {
      const result = await retryPhoneNumber({ data: { workspaceId: workspace.id, numberId: id } });
      if (result.provisioned)
        toast.success("Route configured. Make a test call to check the carrier connection.");
      else toast.error(result.error ?? "Could not configure routing");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not configure routing");
    } finally {
      setBusy(null);
      refresh();
    }
  }
  async function release(id: string, e164: string) {
    if (
      !confirm(
        `Remove ${e164} from aviroh? Calls to it will stop reaching your agents. Release it at your carrier separately.`,
      )
    )
      return;
    setBusy(id);
    try {
      await removePhoneNumber({ data: { workspaceId: workspace.id, numberId: id } });
      toast.success("Number removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove number. Retry removal.");
    } finally {
      setBusy(null);
      refresh();
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="Deploy"
        title="Telephony and channels"
        subtitle="Get a number, choose the agent that answers, and test a real call."
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <GlassCard>
          <Phone className="h-5 w-5 text-primary" />
          <p className="mt-4 font-mono text-2xl font-semibold">
            {data.numbers.filter((n) => n.status !== "released").length}
          </p>
          <p className="text-sm text-muted-foreground">Phone numbers</p>
        </GlassCard>
        <GlassCard>
          <Radio className="h-5 w-5 text-realtime" />
          <p className="mt-4 font-mono text-2xl font-semibold">
            {
              data.numbers.filter(
                (n) =>
                  ["active", "routed"].includes(n.status) && n.dispatch_rule_ref && n.sip_trunk_ref,
              ).length
            }
          </p>
          <p className="text-sm text-muted-foreground">Configured routes</p>
        </GlassCard>
        <GlassCard>
          <RouteIcon className="h-5 w-5 text-warning" />
          <p className="mt-4 font-mono text-2xl font-semibold">
            {data.numbers.filter((n) => n.verified_at && n.status !== "released").length}
          </p>
          <p className="text-sm text-muted-foreground">Verified phone tests</p>
        </GlassCard>
      </div>
      <ManagedInbound
        key={workspace.id}
        workspaceId={workspace.id}
        numbers={data.numbers}
        deployments={data.deps}
        agents={data.agents}
        environments={data.environments}
      />
      <details className="mb-4">
        <summary className="cursor-pointer text-sm text-muted-foreground">
          Advanced: connect a number from your own carrier
        </summary>
        <GlassCard className="mb-4 mt-3 space-y-2">
          <h2 className="font-semibold">Connect Telnyx</h2>
          <p className="text-sm text-muted-foreground">
            Use a Telnyx FQDN SIP connection with TLS, port 5061, SRTP, and +E.164 caller and
            destination numbers. Assign your number to that connection.
          </p>
          {setup?.sipEndpoint ? (
            <p className="text-sm">
              SIP destination: <code className="break-all font-mono">{setup.sipEndpoint}</code>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ask your administrator for the voice service's SIP destination.
            </p>
          )}
          {setup &&
            (!setup.mediaConfigured || !setup.runtimeConfigured || !setup.telnyxAllowed) && (
              <p className="text-sm text-warning">
                Voice service setup is incomplete. Your administrator must configure the service
                credentials and carrier access before routing can finish.
              </p>
            )}
          <p className="text-xs text-muted-foreground">
            Route configured means the voice service has routing instructions. A test call is still
            required to check audio and agent availability.
          </p>
        </GlassCard>
        <GlassCard className="mb-4 space-y-3">
          <h2 className="font-semibold">Add a number</h2>
          <p className="text-xs text-muted-foreground">
            Bring a number you own at Twilio, Telnyx, or another SIP carrier, then point its SIP
            trunk at the voice service.
          </p>
          <form onSubmit={submit} className="grid gap-2 md:grid-cols-5">
            <Input
              required
              placeholder="+15551234567"
              aria-label="Phone number"
              className="font-mono"
              value={num.e164}
              onChange={(e) => setNum({ ...num, e164: e.target.value.trim() })}
            />
            <select
              className={sel}
              aria-label="Carrier"
              value={num.carrier}
              onChange={(e) => setNum({ ...num, carrier: e.target.value as typeof num.carrier })}
            >
              <option value="twilio">Twilio</option>
              <option value="telnyx">Telnyx</option>
              <option value="other">Other SIP</option>
            </select>
            <select
              required
              className={sel}
              aria-label="Agent"
              value={num.agentId}
              onChange={(e) => setNum({ ...num, agentId: e.target.value })}
            >
              <option value="">Agent</option>
              {data.agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select
              required
              className={sel}
              aria-label="Environment"
              value={num.environmentId}
              onChange={(e) => setNum({ ...num, environmentId: e.target.value })}
            >
              <option value="">Environment</option>
              {data.environments.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={busy !== null} className="rounded-full">
              {busy === "add" ? "Adding..." : "Add number"}
            </Button>
          </form>
        </GlassCard>
      </details>
      <GlassCard className="overflow-hidden p-0">
        <div className="border-b border-border p-5">
          <h2 className="font-semibold">Agent assignments</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Change the agent or environment a number reaches at any time.
          </p>
        </div>
        {data.numbers.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            No phone numbers yet. Add one to start taking calls.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {data.numbers
              .filter((n) => n.status !== "released")
              .map((n) => {
                const dep = data.deps.find(
                  (d) => d.agent_id === n.agent_id && d.environment_id === n.environment_id,
                );
                return (
                  <div
                    key={n.id}
                    className="grid gap-3 p-5 text-sm md:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_0.5fr_minmax(0,1fr)_minmax(0,1fr)_0.8fr_minmax(0,1.4fr)] xl:items-center"
                  >
                    <div>
                      <span className="font-mono font-medium">{n.e164}</span>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {n.last_call_at
                          ? `Call received ${new Date(n.last_call_at).toLocaleString()}`
                          : "No calls received yet"}
                      </p>
                      {n.management_mode !== "managed" && n.provisioning_error && (
                        <p className="mt-1 text-xs text-warning">{n.provisioning_error}</p>
                      )}
                    </div>
                    <span className="text-muted-foreground">
                      {n.management_mode === "managed" ? "aviroh" : n.carrier}
                    </span>
                    <select
                      className={`${sel} py-1`}
                      disabled={busy !== null || n.status === "removing"}
                      aria-label={`Agent for ${n.e164}`}
                      value={n.agent_id ?? ""}
                      onChange={(e) => reroute(n.id, { agent_id: e.target.value })}
                    >
                      {data.agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className={`${sel} py-1`}
                      disabled={busy !== null || n.status === "removing"}
                      aria-label={`Environment for ${n.e164}`}
                      value={n.environment_id ?? ""}
                      onChange={(e) => reroute(n.id, { environment_id: e.target.value })}
                    >
                      {data.environments.map((env) => (
                        <option key={env.id} value={env.id}>
                          {env.name}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs">
                      {dep ? (
                        <SystemLabel tone="live">Serves v{dep.agent_version}</SystemLabel>
                      ) : (
                        <SystemLabel tone="warn">No active deployment</SystemLabel>
                      )}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <SystemLabel
                        tone={
                          ["active", "routed"].includes(n.status) &&
                          n.dispatch_rule_ref &&
                          n.sip_trunk_ref
                            ? "ok"
                            : "warn"
                        }
                      >
                        {n.status === "provisioning"
                          ? "Configuring"
                          : n.status === "removing"
                            ? "Removal pending"
                            : ["active", "routed"].includes(n.status) &&
                                n.dispatch_rule_ref &&
                                n.sip_trunk_ref
                              ? "Route configured"
                              : "Setup required"}
                      </SystemLabel>
                      {n.management_mode !== "managed" && n.status !== "removing" && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => retry(n.id)}
                        >
                          {busy === n.id ? "Working..." : "Retry routing"}
                        </Button>
                      )}
                      {n.management_mode !== "managed" && (
                        <button
                          disabled={busy !== null}
                          aria-label={`Remove ${n.e164}`}
                          className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                          onClick={() => release(n.id, n.e164)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </GlassCard>
    </>
  );
}
