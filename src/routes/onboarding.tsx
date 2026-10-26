import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "@/lib/notify";
import { supabase } from "@/integrations/supabase/client";
import { AvirohMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GlassCard, SystemLabel } from "@/components/apple";
import { ArrowLeft, ArrowRight, Check, Copy, ExternalLink, Sparkles } from "lucide-react";
import { DEFAULT_CONFIG } from "@/lib/agent-config";
import { createWebhook, testWebhook } from "@/lib/console.functions";
import { ingestSource } from "@/lib/platform.functions";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
    const { data: existing } = await supabase
      .from("workspaces")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (existing) {
      const { data: agent } = await supabase
        .from("agents")
        .select("id")
        .eq("workspace_id", existing.id)
        .limit(1)
        .maybeSingle();
      if (agent) throw redirect({ to: "/builder/$agentId", params: { agentId: agent.id } });
    }
  },
  head: () => ({
    meta: [
      { title: "Set up your organization: VocollAI" },
      { name: "description", content: "Create your organization and first workspace on VocollAI." },
      { property: "og:title", content: "Set up your organization: VocollAI" },
      {
        property: "og:description",
        content: "Create your organization and first workspace on VocollAI.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Onboarding,
});

function Onboarding() {
  const [businessName, setBusinessName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("Main");
  const [hours, setHours] = useState("");
  const [website, setWebsite] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [step, setStep] = useState(0);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [knowledgeBaseId, setKnowledgeBaseId] = useState<string | null>(null);
  const [knowledgeLinked, setKnowledgeLinked] = useState(false);
  const [knowledgeSourceId, setKnowledgeSourceId] = useState<string | null>(null);
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [webhookId, setWebhookId] = useState<string | null>(null);
  const [webhookTestStatus, setWebhookTestStatus] = useState<string | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [indexingError, setIndexingError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [restored, setRestored] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const createNotificationWebhook = useServerFn(createWebhook);
  const testNotificationWebhook = useServerFn(testWebhook);
  const ingest = useServerFn(ingestSource);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem("aviroh.self-serve-setup");
      if (raw) {
        const saved = JSON.parse(raw) as {
          workspaceId?: string;
          businessName?: string;
          workspaceName?: string;
          hours?: string;
          website?: string;
          webhookUrl?: string;
          step?: number;
          agentId?: string;
          knowledgeBaseId?: string;
          knowledgeSourceId?: string;
          knowledgeLinked?: boolean;
          done?: boolean;
        };
        if (saved.workspaceId) setWorkspaceId(saved.workspaceId);
        if (saved.businessName) setBusinessName(saved.businessName);
        if (saved.workspaceName) setWorkspaceName(saved.workspaceName);
        if (saved.hours) setHours(saved.hours);
        if (saved.website) setWebsite(saved.website);
        if (saved.webhookUrl) setWebhookUrl(saved.webhookUrl);
        if (saved.step != null) setStep(saved.step);
        if (saved.agentId) setAgentId(saved.agentId);
        if (saved.knowledgeBaseId) setKnowledgeBaseId(saved.knowledgeBaseId);
        if (saved.knowledgeSourceId) setKnowledgeSourceId(saved.knowledgeSourceId);
        if (saved.knowledgeLinked) setKnowledgeLinked(true);
        if (saved.done) setDone(true);
      }
    } catch {
      window.sessionStorage.removeItem("aviroh.self-serve-setup");
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored || !workspaceId) return;
    window.sessionStorage.setItem(
      "aviroh.self-serve-setup",
      JSON.stringify({
        workspaceId,
        businessName,
        workspaceName,
        hours,
        website,
        webhookUrl,
        step,
        agentId,
        knowledgeBaseId,
        knowledgeSourceId,
        knowledgeLinked,
        done,
      }),
    );
  }, [
    restored,
    workspaceId,
    businessName,
    workspaceName,
    hours,
    website,
    webhookUrl,
    step,
    agentId,
    knowledgeBaseId,
    knowledgeSourceId,
    knowledgeLinked,
    done,
  ]);

  async function createWorkspace() {
    if (!businessName.trim()) {
      toast.error("Enter your business name.");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("create_organization", {
        _org_name: businessName.trim(),
        _workspace_name: workspaceName.trim() || "Main",
      });
      if (error || !data) throw error ?? new Error("Could not create your workspace.");
      setWorkspaceId(data);
      setStep(1);
      await qc.invalidateQueries({ queryKey: ["workspaces"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create your workspace.");
    } finally {
      setBusy(false);
    }
  }

  async function finishSetup() {
    if (!workspaceId) {
      toast.error("Create your workspace first.");
      setStep(0);
      return;
    }
    if (!agentId && !businessName.trim()) {
      toast.error("Enter your business name first.");
      setStep(0);
      return;
    }
    if (website.trim()) {
      try {
        const parsed = new URL(website.trim());
        if (parsed.protocol !== "https:") throw new Error("Use a secure https:// website address.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Enter a valid website address.");
        setStep(1);
        return;
      }
    }
    if (webhookUrl.trim()) {
      try {
        const parsed = new URL(webhookUrl.trim());
        if (parsed.protocol !== "https:") throw new Error("Use a secure https:// webhook address.");
        if (
          parsed.username ||
          parsed.password ||
          [...parsed.searchParams.keys()].some((key) => /key|token|secret|auth|sig/i.test(key))
        )
          throw new Error(
            "Remove credentials from the webhook URL. Store them in your receiver and verify aviroh signatures instead.",
          );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Enter a valid webhook address.");
        setStep(1);
        return;
      }
    }
    setBusy(true);
    try {
      let createdAgentId = agentId;
      if (!createdAgentId) {
        const businessFacts = [
          `Business name: ${businessName.trim()}.`,
          hours.trim()
            ? `Business-provided hours: ${hours.trim()}. Do not infer or promise availability outside those stated hours.`
            : "Business hours have not been provided; do not invent them.",
          "Only claim bookings, orders, transfers, notifications, or other actions when a connected and approved tool confirms success.",
        ].join("\n");
        const config = {
          ...DEFAULT_CONFIG,
          persona: `A helpful, business-agnostic voice receptionist for ${businessName.trim()}.`,
          instructions: `${businessFacts}\n\nAnswer using only the attached, approved business knowledge. Ask one clear question at a time. If a request needs an action that is not connected, explain that plainly and do not claim it was completed.`,
          greeting: `Hello, thanks for calling ${businessName.trim()}. How can I help you today?`,
          handoff:
            "No live transfer is configured. Do not imply that a person was contacted or that a callback is guaranteed.",
        };
        const { data, error } = await supabase
          .from("agents")
          .insert({
            workspace_id: workspaceId,
            name: `${businessName.trim()} Receptionist`.slice(0, 80),
            description: "Business voice receptionist draft",
            config: config as never,
          })
          .select("id")
          .single();
        if (error || !data) throw error ?? new Error("Could not save the agent draft.");
        createdAgentId = data.id;
        setAgentId(data.id);
      }
      let currentKnowledgeBaseId = knowledgeBaseId;
      let currentKnowledgeSourceId = knowledgeSourceId;
      if (website.trim() && !currentKnowledgeBaseId) {
        const { data, error } = await supabase
          .from("knowledge_bases")
          .insert({
            workspace_id: workspaceId,
            name: `${businessName.trim()} Information`.slice(0, 80),
            description: "Business information added during guided setup.",
          })
          .select("id")
          .single();
        if (error || !data)
          throw (
            error ??
            new Error("The agent draft was saved, but the knowledge base could not be created.")
          );
        currentKnowledgeBaseId = data.id;
        setKnowledgeBaseId(data.id);
      }
      if (currentKnowledgeBaseId && !knowledgeLinked) {
        const { data: existingLink, error: lookupError } = await supabase
          .from("agent_knowledge_bases")
          .select("agent_id")
          .eq("agent_id", createdAgentId)
          .eq("knowledge_base_id", currentKnowledgeBaseId)
          .maybeSingle();
        if (lookupError)
          throw new Error("The draft was saved, but its knowledge link could not be checked.");
        if (!existingLink) {
          const { error: linkError } = await supabase.from("agent_knowledge_bases").insert({
            agent_id: createdAgentId,
            knowledge_base_id: currentKnowledgeBaseId,
            workspace_id: workspaceId,
          });
          if (linkError)
            throw new Error(
              "The draft and knowledge base were saved, but the knowledge base could not be attached.",
            );
        }
        setKnowledgeLinked(true);
      }
      if (website.trim() && currentKnowledgeBaseId && !currentKnowledgeSourceId) {
        const { data: source, error: sourceError } = await supabase
          .from("knowledge_sources")
          .insert({
            knowledge_base_id: currentKnowledgeBaseId,
            workspace_id: workspaceId,
            kind: "url",
            name: new URL(website.trim()).hostname,
            source_url: website.trim(),
          } as never)
          .select("id")
          .single();
        if (sourceError || !source)
          throw new Error("The draft was saved, but the website source could not be added.");
        currentKnowledgeSourceId = source.id;
        setKnowledgeSourceId(source.id);
      }
      if (currentKnowledgeSourceId && !indexingError) {
        setIndexing(true);
        try {
          await ingest({ data: { sourceId: currentKnowledgeSourceId } });
        } catch (error) {
          setIndexingError(
            error instanceof Error ? error.message : "Website indexing needs attention.",
          );
        } finally {
          setIndexing(false);
        }
      }
      if (webhookUrl.trim() && !webhookSecret) {
        const result = await createNotificationWebhook({
          data: { workspaceId, url: webhookUrl.trim(), events: ["tool.succeeded"] },
        });
        setWebhookSecret(result.secret);
        setWebhookId(result.id);
      }
      setDone(true);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["workspaces"] }),
        qc.invalidateQueries({ queryKey: ["workspace"] }),
        qc.invalidateQueries({ queryKey: ["agents"] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Setup could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  async function copySecret() {
    if (!webhookSecret) return;
    try {
      await navigator.clipboard.writeText(webhookSecret);
      toast.success(
        "Signing secret copied. Store it safely; it will not be shown again after leaving this page.",
      );
    } catch {
      toast.error("Could not copy the signing secret. Select and copy it manually.");
    }
  }

  async function sendWebhookTest() {
    if (!webhookId) return;
    setBusy(true);
    setWebhookTestStatus(null);
    try {
      const result = await testNotificationWebhook({ data: { id: webhookId } });
      setWebhookTestStatus(
        result.status != null && result.status >= 200 && result.status < 300
          ? `Receiver accepted the signed test event (HTTP ${result.status}).`
          : (result.error ?? `Receiver answered ${result.status ?? "without an HTTP response"}.`),
      );
    } catch (error) {
      setWebhookTestStatus(error instanceof Error ? error.message : "Webhook test failed.");
    } finally {
      setBusy(false);
    }
  }

  if (done && agentId)
    return (
      <div className="grid min-h-screen place-items-center px-5 py-10">
        <GlassCard className="w-full max-w-2xl space-y-5">
          <AvirohMark className="h-11 w-11" />
          <SystemLabel tone="ok">Draft created</SystemLabel>
          <h1 className="text-2xl font-semibold tracking-tight">Your setup is ready for review</h1>
          <p className="text-sm text-muted-foreground">
            The agent is an unpublished draft. No phone number was purchased, no deployment was
            activated, and no action pack was auto-approved.
          </p>
          {knowledgeSourceId && (
            <div className="rounded-xl border border-border p-4">
              <p className="font-medium">Website knowledge</p>
              {indexing ? (
                <p className="mt-1 text-sm text-muted-foreground">Indexing is still in progress.</p>
              ) : indexingError ? (
                <p className="mt-1 text-sm text-warning">
                  Indexing needs attention: {indexingError}
                </p>
              ) : (
                <p className="mt-1 text-sm text-success">Website indexing completed.</p>
              )}
            </div>
          )}
          {webhookSecret && (
            <div className="rounded-xl border border-border p-4">
              <p className="font-medium">Webhook signing secret</p>
              <p className="mt-1 text-xs text-muted-foreground">
                The endpoint receives only a successful tool event ID, tool ID/name, and execution
                context. It does not include caller details, transcript, arguments, or tool output.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Input
                  readOnly
                  value={webhookSecret}
                  aria-label="Webhook signing secret"
                  className="min-w-0 flex-1 font-mono"
                />
                <Button type="button" variant="outline" onClick={copySecret}>
                  <Copy className="h-4 w-4" /> Copy
                </Button>
              </div>
              {webhookId && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" disabled={busy} onClick={sendWebhookTest}>
                    {busy ? "Sending test…" : "Send signed test event"}{" "}
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  {webhookTestStatus && (
                    <p role="status" className="text-xs text-muted-foreground">
                      {webhookTestStatus}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button asChild className="rounded-full">
              <Link to="/builder/$agentId" params={{ agentId }}>
                Continue in Chat Builder <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/overview">Go to Overview</Link>
            </Button>
          </div>
          <div className="border-t border-border pt-3">
            <button className="text-sm font-medium" onClick={() => setAdvanced(!advanced)}>
              {advanced ? "Hide" : "Show"} advanced settings
            </button>
            {advanced && (
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                <Link className="underline" to="/tools">
                  Tools and approvals
                </Link>
                <Link className="underline" to="/evals">
                  Evaluation gates
                </Link>
                <Link className="underline" to="/environments">
                  Environments
                </Link>
                <Link className="underline" to="/deployments">
                  Deployments
                </Link>
              </div>
            )}
          </div>
        </GlassCard>
      </div>
    );

  const stepNames = ["Business profile", "Connections", "Agent draft"];
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-2xl space-y-5">
        <div className="flex items-center gap-3">
          <AvirohMark className="h-10 w-10" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Guided setup · Step {step + 1} of 3
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">Get your voice agent started</h1>
          </div>
        </div>
        <ol className="grid gap-2 sm:grid-cols-3">
          {stepNames.map((name, index) => (
            <li
              key={name}
              className={`rounded-xl border px-3 py-2 text-sm ${index === step ? "border-primary bg-primary/5" : index < step ? "border-success/40 text-success" : "border-border text-muted-foreground"}`}
            >
              {index < step ? "✓ " : `${index + 1}. `}
              {name}
            </li>
          ))}
        </ol>
        {step === 0 && (
          <GlassCard className="space-y-4">
            <h2 className="font-semibold">Tell us about your business</h2>
            <p className="text-sm text-muted-foreground">
              This creates your organization and workspace, then uses only the business facts you
              provide.
            </p>
            <label className="block text-sm">
              Business name
              <Input
                className="mt-1.5"
                required
                maxLength={120}
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Northstar Services"
              />
            </label>
            <label className="block text-sm">
              Workspace name
              <Input
                className="mt-1.5"
                required
                maxLength={120}
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Business hours or service notes{" "}
              <span className="text-muted-foreground">(optional)</span>
              <Textarea
                className="mt-1.5"
                maxLength={1500}
                rows={4}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="For example: Monday–Friday, 9am–5pm Pacific. The agent will not infer information you have not provided."
              />
            </label>
            <div className="flex justify-end">
              <Button
                type="button"
                className="rounded-full"
                disabled={busy}
                onClick={createWorkspace}
              >
                {busy ? "Creating workspace…" : "Continue"} <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </GlassCard>
        )}
        {step === 1 && (
          <GlassCard className="space-y-4">
            <h2 className="font-semibold">Add knowledge and a notification connection</h2>
            {workspaceId && (
              <Link
                to="/builder/$agentId"
                params={{ agentId: "new" }}
                className="block text-sm text-primary underline"
              >
                Start with the guided assistant builder
              </Link>
            )}
            <p className="text-sm text-muted-foreground">
              Both are optional. Website content is fetched through guarded HTTPS transport. A
              webhook is only a notification destination; it does not create or approve actions.
            </p>
            <label className="block text-sm">
              Public website URL
              <Input
                className="mt-1.5"
                type="url"
                inputMode="url"
                maxLength={1000}
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://example.com"
              />
            </label>
            <label className="block text-sm">
              Successful-tool webhook URL <span className="text-muted-foreground">(optional)</span>
              <Input
                className="mt-1.5"
                type="url"
                inputMode="url"
                maxLength={1000}
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://hooks.example.com/..."
              />
            </label>
            <div className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
              After an approved live action succeeds, the signed webhook includes the event ID, tool
              ID/name, and context only. It excludes caller details, transcripts, arguments, and
              results. SMS and email delivery are not configured by this wizard.
            </div>
            <div className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => setStep(0)}
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button type="button" className="rounded-full" onClick={() => setStep(2)}>
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </GlassCard>
        )}
        {step === 2 && (
          <GlassCard className="space-y-4">
            <h2 className="font-semibold">Review your first agent draft</h2>
            <div className="rounded-xl bg-muted p-4">
              <p className="font-medium">
                <Sparkles className="mr-2 inline h-4 w-4 text-primary" />
                {businessName || "Your business"} Receptionist
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                A concise, business-agnostic receptionist using the hours and knowledge you
                supplied. It will not claim to book, transfer, notify, or complete actions without a
                connected tool confirming success.
              </p>
              {hours.trim() && <p className="mt-3 whitespace-pre-wrap text-sm">{hours}</p>}
            </div>
            <p className="text-sm text-muted-foreground">
              When you finish, we save an unpublished draft. You can review it, connect and approve
              real tools, test available providers, then explicitly publish and deploy.
            </p>
            {website && (
              <SystemLabel tone="muted">
                Website knowledge will be added and indexed if a compatible embedding credential is
                available.
              </SystemLabel>
            )}
            {webhookUrl && (
              <SystemLabel tone="muted">
                Signed webhook notifications enabled for successful live tool actions.
              </SystemLabel>
            )}
            <div className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => setStep(1)}
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                type="button"
                className="rounded-full"
                disabled={busy || indexing}
                onClick={finishSetup}
              >
                <Check className="h-4 w-4" />
                {busy ? "Saving setup…" : indexing ? "Indexing website…" : "Create draft"}
              </Button>
            </div>
          </GlassCard>
        )}
        <p className="text-center text-xs text-muted-foreground">
          No phone number is purchased and no production calls are routed until you explicitly
          complete telephony and deployment setup.
        </p>
      </div>
    </div>
  );
}
