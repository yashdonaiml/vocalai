import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DeveloperAccessGate } from "@/components/developer-access-gate";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard, PageHeader } from "@/components/apple";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/lib/notify";
import { useWorkspace } from "@/lib/workspace";
import {
  DEFAULT_COMPOSABLE,
  DEFAULT_CONFIG,
  DEFAULT_RUNTIME,
  type AgentConfig,
  type ConversationFlow,
} from "@/lib/agent-config";
import { draftAgent } from "@/lib/agent-draft.functions";

export const Route = createFileRoute("/_authenticated/agents/new")({
  head: () => ({
    meta: [
      { title: "New agent: VocollAI" },
      {
        name: "description",
        content: "Set up a new voice agent step by step, or describe it and let AI draft it.",
      },
      { property: "og:title", content: "New agent: VocollAI" },
      {
        property: "og:description",
        content: "Set up a new voice agent step by step, or describe it and let AI draft it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewAgent,
});

const STEPS = ["Describe", "Instructions", "Knowledge and tools", "Voice", "Review"];
const label = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

function stepsToFlow(steps: { title: string; say: string }[]): ConversationFlow | undefined {
  if (steps.length < 2) return undefined;
  const nodes = steps.map((s, i) => ({
    id: crypto.randomUUID(),
    type: (i === 0 ? "start" : i === steps.length - 1 ? "end" : "step") as "start" | "step" | "end",
    title: s.title,
    say: s.say,
    x: 40 + i * 260,
    y: 120 + (i % 2) * 80,
  }));
  return {
    enabled: true,
    nodes,
    edges: nodes
      .slice(1)
      .map((n, i) => ({ id: crypto.randomUUID(), source: nodes[i]!.id, target: n.id, when: "" })),
  };
}

function NewAgent() {
  return (
    <DeveloperAccessGate>
      <NewAgentForm />
    </DeveloperAccessGate>
  );
}

function NewAgentForm() {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const draft = useServerFn(draftAgent);
  const [step, setStep] = useState(0);
  const [about, setAbout] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cfg, setCfg] = useState<AgentConfig>(DEFAULT_CONFIG);
  const [flow, setFlow] = useState<ConversationFlow | undefined>();
  const [useFlow, setUseFlow] = useState(true);
  const [kbIds, setKbIds] = useState<string[]>([]);
  const [toolIds, setToolIds] = useState<string[]>([]);
  const set = <K extends keyof AgentConfig>(k: K, v: AgentConfig[K]) =>
    setCfg((c) => ({ ...c, [k]: v }));

  const { data: lists } = useQuery({
    queryKey: ["agent-wizard-lists", ws.id],
    queryFn: async () => {
      const [kbs, tools] = await Promise.all([
        supabase.from("knowledge_bases").select("id, name").eq("workspace_id", ws.id).order("name"),
        supabase
          .from("tools")
          .select("id, name, description")
          .eq("workspace_id", ws.id)
          .order("name"),
      ]);
      return { kbs: kbs.data ?? [], tools: tools.data ?? [] };
    },
  });

  async function aiDraft() {
    if (about.trim().length < 10) {
      toast.error("Describe the agent in a sentence or two first.");
      return;
    }
    setDrafting(true);
    try {
      const d = await draft({
        data: { workspaceId: ws.id, description: about, language: cfg.language },
      });
      setName(d.name);
      setDescription(d.description);
      setCfg((c) => ({
        ...c,
        persona: d.persona || c.persona,
        instructions: d.instructions || c.instructions,
        greeting: d.greeting || c.greeting,
        guardrails: d.guardrails || c.guardrails,
        handoff: d.handoff || c.handoff,
      }));
      setFlow(stepsToFlow(d.steps));
      toast.success("Draft ready. Review and edit it.");
      setStep(1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The draft could not be created");
    } finally {
      setDrafting(false);
    }
  }

  async function create() {
    if (!name.trim()) {
      toast.error("Give the agent a name.");
      setStep(1);
      return;
    }
    setCreating(true);
    const config = { ...cfg, ...(flow && useFlow ? { flow } : {}) };
    const { data, error } = await supabase
      .from("agents")
      .insert({
        workspace_id: ws.id,
        name: name.trim().slice(0, 80),
        description: description.trim().slice(0, 300),
        config: config as never,
      })
      .select("id")
      .single();
    if (error) {
      setCreating(false);
      toast.error(error.message);
      return;
    }
    const results = await Promise.all([
      kbIds.length
        ? supabase
            .from("agent_knowledge_bases")
            .insert(
              kbIds.map((k) => ({ agent_id: data.id, knowledge_base_id: k, workspace_id: ws.id })),
            )
        : null,
      toolIds.length
        ? supabase
            .from("agent_tools")
            .insert(toolIds.map((t) => ({ agent_id: data.id, tool_id: t, workspace_id: ws.id })))
        : null,
    ]);
    if (results.some((r) => r?.error))
      toast.error("The agent was created, but some knowledge or tools could not be attached.");
    else toast.success("Agent created as a draft");
    qc.invalidateQueries({ queryKey: ["agents"] });
    navigate({ to: "/agents/$id", params: { id: data.id } });
  }

  const toggle = (list: string[], id: string, setter: (v: string[]) => void) =>
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const native = cfg.runtime.mode === "native";

  return (
    <>
      <Link
        to="/agents"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Agents
      </Link>
      <PageHeader
        eyebrow="Build"
        title="New agent"
        subtitle="Describe your agent and let AI draft it, or set it up yourself."
      />
      <ol className="mb-6 flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              onClick={() => (i === 0 || name || i <= step) && setStep(i)}
              className={`rounded-full px-3 py-1.5 text-sm ${i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-accent" : "border border-border text-muted-foreground"}`}
            >
              {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>

      <div className="max-w-3xl">
        {step === 0 && (
          <GlassCard className="space-y-4">
            <h2 className="font-semibold">What should this agent do?</h2>
            <Textarea
              rows={6}
              maxLength={2000}
              placeholder="We are a dental clinic. The agent answers calls, books cleanings and checkups, and takes messages for the dentist."
              value={about}
              onChange={(e) => setAbout(e.target.value)}
            />
            <label className="block max-w-xs">
              <span className={label}>Language</span>
              <Input
                className="mt-1.5"
                value={cfg.language}
                onChange={(e) => set("language", e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button className="rounded-full" onClick={aiDraft} disabled={drafting}>
                <Sparkles className="h-4 w-4" /> {drafting ? "Drafting" : "Draft with AI"}
              </Button>
              <Button variant="outline" className="rounded-full" onClick={() => setStep(1)}>
                Write it myself
              </Button>
            </div>
          </GlassCard>
        )}

        {step === 1 && (
          <GlassCard className="space-y-4">
            <h2 className="font-semibold">Instructions</h2>
            <label className="block">
              <span className={label}>Name</span>
              <Input
                className="mt-1.5"
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block">
              <span className={label}>Description</span>
              <Input
                className="mt-1.5"
                maxLength={300}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="block">
              <span className={label}>Persona</span>
              <Input
                className="mt-1.5"
                maxLength={300}
                value={cfg.persona}
                onChange={(e) => set("persona", e.target.value)}
              />
            </label>
            <label className="block">
              <span className={label}>Instructions</span>
              <Textarea
                className="mt-1.5"
                rows={7}
                maxLength={12000}
                value={cfg.instructions}
                onChange={(e) => set("instructions", e.target.value)}
              />
            </label>
            <label className="block">
              <span className={label}>Opening line</span>
              <Input
                className="mt-1.5"
                maxLength={400}
                value={cfg.greeting}
                onChange={(e) => set("greeting", e.target.value)}
              />
            </label>
            {flow && (
              <div className="rounded-xl border border-border p-3">
                <label className="flex items-center justify-between gap-3 text-sm font-medium">
                  Add these call steps as a conversation flow{" "}
                  <Switch checked={useFlow} onCheckedChange={setUseFlow} />
                </label>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                  {flow.nodes.map((n) => (
                    <li key={n.id}>
                      <span className="text-foreground">{n.title}:</span> {n.say}
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-xs text-muted-foreground">
                  You can redraw it later on the Flow tab.
                </p>
              </div>
            )}
          </GlassCard>
        )}

        {step === 2 && (
          <GlassCard className="space-y-5">
            <div>
              <h2 className="font-semibold">Knowledge</h2>
              {lists?.kbs.length ? (
                lists.kbs.map((k) => (
                  <label key={k.id} className="mt-2 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={kbIds.includes(k.id)}
                      onChange={() => toggle(kbIds, k.id, setKbIds)}
                    />{" "}
                    {k.name}
                  </label>
                ))
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  No knowledge bases yet.{" "}
                  <Link to="/knowledge" className="underline">
                    Add one
                  </Link>{" "}
                  later and attach it from the agent.
                </p>
              )}
            </div>
            <div>
              <h2 className="font-semibold">Tools</h2>
              {lists?.tools.length ? (
                lists.tools.map((t) => (
                  <label key={t.id} className="mt-2 flex items-start gap-2 text-sm">
                    <input
                      className="mt-1"
                      type="checkbox"
                      checked={toolIds.includes(t.id)}
                      onChange={() => toggle(toolIds, t.id, setToolIds)}
                    />
                    <span>
                      {t.name}
                      {t.description && (
                        <span className="block text-xs text-muted-foreground">{t.description}</span>
                      )}
                    </span>
                  </label>
                ))
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  No tools yet.{" "}
                  <Link to="/tools" className="underline">
                    Add one
                  </Link>{" "}
                  later and attach it from the agent.
                </p>
              )}
            </div>
          </GlassCard>
        )}

        {step === 3 && (
          <GlassCard className="space-y-4">
            <h2 className="font-semibold">Voice</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => set("runtime", DEFAULT_RUNTIME)}
                className={`rounded-2xl border p-4 text-left ${native ? "border-primary ring-2 ring-primary/30" : "border-border"}`}
              >
                <p className="font-medium">One voice model</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  A single model listens and speaks. Most natural, fewest settings.
                </p>
              </button>
              <button
                onClick={() => set("runtime", DEFAULT_COMPOSABLE)}
                className={`rounded-2xl border p-4 text-left ${!native ? "border-primary ring-2 ring-primary/30" : "border-border"}`}
              >
                <p className="font-medium">Pick each part</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choose separate models for listening, thinking, and speaking.
                </p>
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              You can change models and voices on the Voice and AI tab after creating the agent.
            </p>
          </GlassCard>
        )}

        {step === 4 && (
          <GlassCard className="space-y-3">
            <h2 className="font-semibold">Review</h2>
            <dl className="grid gap-2 text-sm sm:grid-cols-[160px_1fr]">
              <dt className="text-muted-foreground">Name</dt>
              <dd>{name || "Not set"}</dd>
              <dt className="text-muted-foreground">Opening line</dt>
              <dd>{cfg.greeting}</dd>
              <dt className="text-muted-foreground">Conversation flow</dt>
              <dd>{flow && useFlow ? `${flow.nodes.length} steps` : "None"}</dd>
              <dt className="text-muted-foreground">Knowledge</dt>
              <dd>{kbIds.length || "None"}</dd>
              <dt className="text-muted-foreground">Tools</dt>
              <dd>{toolIds.length || "None"}</dd>
              <dt className="text-muted-foreground">Voice</dt>
              <dd>{native ? "One voice model" : "Pick each part"}</dd>
            </dl>
            <p className="text-xs text-muted-foreground">
              The agent is saved as a draft. Test it, then publish when ready.
            </p>
          </GlassCard>
        )}

        {step > 0 && (
          <div className="mt-4 flex justify-between">
            <Button variant="outline" className="rounded-full" onClick={() => setStep(step - 1)}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {step < 4 ? (
              <Button
                className="rounded-full"
                onClick={() =>
                  step === 1 && !name.trim()
                    ? toast.error("Give the agent a name.")
                    : setStep(step + 1)
                }
              >
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button className="rounded-full" onClick={create} disabled={creating}>
                <Check className="h-4 w-4" /> {creating ? "Creating" : "Create agent"}
              </Button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
