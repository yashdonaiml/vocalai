import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCircle2, RefreshCw } from "lucide-react";
import { GlassCard, PageHeader, SectionTitle, SystemLabel } from "@/components/apple";
import { TestCall } from "@/components/agent-runtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { beginEnquirySetup, getEnquirySetup, getEnquiryPreviewResult, saveEnquirySetup, startEnquiryPreview } from "@/lib/setup.functions";

const queryKey = (workspaceId: string, agentId: string) => ["enquiry-setup", workspaceId, agentId] as const;
const terminalStates = new Set(["saved", "not_saved", "unknown", "failed"]);

export function AssistantSetup({ workspaceId, agentId }: { workspaceId: string; agentId: string }) {
  const getSetup = useServerFn(getEnquirySetup);
  const beginSetup = useServerFn(beginEnquirySetup);
  const saveSetup = useServerFn(saveEnquirySetup);
  const startPreview = useServerFn(startEnquiryPreview);
  const getResult = useServerFn(getEnquiryPreviewResult);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", brief: "" });
  const [busy, setBusy] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const [safeError, setSafeError] = useState<string | null>(null);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const initialized = useRef(false);
  const beginKey = useRef<string | null>(null);
  const previewKey = useRef<string | null>(null);
  const fresh = agentId === "new";

  const setup = useQuery({
    queryKey: queryKey(workspaceId, agentId),
    queryFn: () => getSetup({ data: { workspaceId, agentId } }),
    enabled: !fresh,
    retry: false,
  });
  const existingAgent = useQuery({
    queryKey: ["enquiry-setup-agent", workspaceId, agentId],
    queryFn: async () => {
      const { data, error } = await supabase.from("agents").select("id,name,description").eq("id", agentId).eq("workspace_id", workspaceId).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !fresh,
    retry: false,
  });
  const state = setup.data;
  useEffect(() => {
    if (initialized.current) return;
    if (state) {
      setForm(state.businessDraft);
      setSessionId(state.latestSessionId ?? null);
      initialized.current = true;
    } else if (!setup.isFetching && existingAgent.data) {
      setForm({ name: existingAgent.data.name, brief: existingAgent.data.description ?? "" });
      initialized.current = true;
    }
  }, [state, setup.isFetching, existingAgent.data]);

  const result = useQuery({
    queryKey: ["enquiry-preview-result", workspaceId, state?.setupId, sessionId],
    queryFn: () => getResult({ data: { workspaceId, setupId: state!.setupId, sessionId: sessionId! } }),
    enabled: !!state?.setupId && !!sessionId,
    retry: false,
    refetchInterval: query => {
      const value = query.state.data;
      if (query.state.error || (value && terminalStates.has(value.state))) return false;
      return 2000;
    },
  });
  const dirty = !!state && (form.name !== state.businessDraft.name || form.brief !== state.businessDraft.brief);
  const valid = form.name.trim().length > 0 && form.brief.trim().length >= 10;
  const preparing = busy || callActive;
  const ready = !!state?.readiness.ready && !dirty && !preparing;
  const receipt = !dirty ? result.data?.receipt ?? state?.receipt : null;
  const savingResult = disconnected && !!sessionId && !result.error && (!result.data || !terminalStates.has(result.data.state));

  async function save() {
    if (!valid || preparing || (!fresh && !state && !replaceConfirmed)) return;
    setBusy(true); setSafeError(null);
    try {
      if (state) {
        const next = await saveSetup({ data: { workspaceId, setupId: state.setupId, expectedRevision: state.revision, businessDraft: { name: form.name.trim(), brief: form.brief.trim() } } });
        qc.setQueryData(queryKey(workspaceId, agentId), next);
        setForm(next.businessDraft);
        setSessionId(null); setDisconnected(false); previewKey.current = null;
      } else {
        beginKey.current ??= crypto.randomUUID();
        const created = await beginSetup({ data: { workspaceId, ...(fresh ? {} : { agentId }), name: form.name.trim(), brief: form.brief.trim(), requestKey: beginKey.current } });
        await qc.invalidateQueries({ queryKey: ["agents"] });
        await qc.invalidateQueries({ queryKey: ["overview", workspaceId] });
        await navigate({ to: "/assistant-setup/$agentId", params: { agentId: created.agentId }, replace: true });
        await qc.invalidateQueries({ queryKey: queryKey(workspaceId, created.agentId) });
      }
    } catch (error) {
      setSafeError(error instanceof Error ? error.message : "Could not save your business brief. Try again.");
    } finally { setBusy(false); }
  }

  async function startSession() {
    if (!state || !ready) throw new Error("Save your brief and resolve the readiness checks before starting a preview.");
    previewKey.current ??= crypto.randomUUID();
    setSafeError(null); setDisconnected(false);
    const join = await startPreview({ data: { workspaceId, setupId: state.setupId, expectedRevision: state.revision, requestKey: previewKey.current } });
    previewKey.current = null;
    return join;
  }

  if (!fresh && (setup.isLoading || existingAgent.isLoading)) return <GlassCard><p role="status">Loading your assistant setup…</p></GlassCard>;
  if (!fresh && (setup.error || existingAgent.error || !existingAgent.data)) return <GlassCard className="space-y-3"><h1 className="font-semibold">Setup is unavailable</h1><p className="text-sm text-muted-foreground">{setup.error instanceof Error ? setup.error.message : "This assistant could not be loaded in the selected workspace."}</p><Button variant="outline" onClick={() => { void setup.refetch(); void existingAgent.refetch(); }}><RefreshCw /> Try again</Button><Link className="block text-sm text-primary underline" to="/overview">Back to Overview</Link></GlassCard>;

  return <div className="mx-auto max-w-5xl">
    <Link to="/overview" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Overview</Link>
    <PageHeader eyebrow="Guided setup" title="Try your enquiry assistant" subtitle="Describe your business, speak to the assistant, and verify a saved callback request—all in one place." />
    <GlassCard className="mb-5"><SystemLabel tone="warn">Inbox-only preview</SystemLabel><p className="mt-2 text-sm text-muted-foreground">This preview can save a caller-confirmed enquiry to your callback inbox. It does not connect an external application, notify anyone, buy a number, publish an agent, or activate live calling.</p></GlassCard>
    {safeError && <div role="alert" className="mb-5 rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm">{safeError}</div>}
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <GlassCard>
        <SectionTitle title="1. Describe the business" subtitle="Include only facts the assistant may use. It will not invent hours, prices, or policies." />
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); void save(); }}>
          <label className="block text-sm">Business name<Input required maxLength={120} disabled={preparing} className="mt-1.5" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Northstar Services" /></label>
          <label className="block text-sm">What should callers know?<Textarea required minLength={10} maxLength={2000} rows={7} disabled={preparing} className="mt-1.5" value={form.brief} onChange={e => setForm({ ...form, brief: e.target.value })} placeholder="We repair household appliances. Take the caller's name, phone number and reason for calling. We cannot promise a return-call time." /></label>
          <p className="text-xs text-muted-foreground">The assistant collects a name, phone with country code, and reason. Preferred callback time is optional. A saved request is awaiting manual review, not an appointment or a promised callback.</p>
          {!fresh && !state && <label className="flex items-start gap-2 rounded-lg border border-warning/40 p-3 text-sm"><input type="checkbox" disabled={preparing} checked={replaceConfirmed} onChange={e => setReplaceConfirmed(e.target.checked)} /><span>Prepare this agent's editable draft for the enquiry preview. This replaces its draft instructions and task setup; published versions stay unchanged.</span></label>}
          <Button type="submit" disabled={preparing || !valid || (!fresh && !state && !replaceConfirmed) || (!!state && !dirty)}>{busy ? "Saving…" : state ? "Save changes" : "Prepare inbox preview"}</Button>
          {dirty && <p role="status" className="text-sm text-warning">Save these changes before testing. Previous test evidence does not apply to the changed brief.</p>}
          {state && !dirty && <p className="text-xs text-muted-foreground">Saved. You can leave this page and continue later.</p>}
        </form>
      </GlassCard>
      <div className="space-y-5">
        {!state ? <GlassCard><SectionTitle title="2. Speak to your assistant" subtitle="Prepare the brief first. Then authorize a real browser voice preview using test contact details." /></GlassCard> : <>
          {!state.readiness.ready && <GlassCard><SectionTitle title="Before the voice preview" /><ul className="list-disc space-y-2 pl-5 text-sm">{state.readiness.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul><Button className="mt-3" variant="outline" disabled={preparing} onClick={() => void setup.refetch()}><RefreshCw /> Check again</Button></GlassCard>}
          <TestCall agentId={agentId} startSession={startSession} disabled={!ready || savingResult} onStatusChange={status => setCallActive(status !== "idle")} onSessionStarted={id => { setSessionId(id); setDisconnected(false); }} onDisconnected={() => { setCallActive(false); setDisconnected(true); void result.refetch(); }} onError={setSafeError} />
        </>}
        <GlassCard>
          <SectionTitle title="3. Verify the saved result" subtitle="Spoken claims and browser captions are not proof. The receipt below comes from the saved call and action records." />
          {savingResult && <p role="status" className="text-sm text-muted-foreground">The call has ended. Waiting for its saved result…</p>}
          {result.error && <div className="space-y-2"><p role="alert" className="text-sm text-warning">The saved result could not be checked. This does not mean the request failed or that it is safe to repeat it.</p><Button variant="outline" onClick={() => void result.refetch()}>Check saved result</Button></div>}
          {receipt ? <div className="space-y-3"><SystemLabel tone="ok"><CheckCircle2 className="mr-1 inline h-3 w-3" /> Enquiry saved to inbox</SystemLabel><p className="text-sm">Saved {new Date(receipt.savedAt).toLocaleString()}. Nobody has been notified, and a return call is not guaranteed.</p><p className="break-all font-mono text-xs text-muted-foreground">Request {receipt.invocationId}</p><div className="flex flex-wrap gap-3 text-sm"><Link to="/callbacks" className="text-primary underline">Open callback inbox</Link><Link to="/conversations/$id" params={{ id: receipt.conversationId }} className="text-primary underline">View this call</Link></div></div> : !savingResult && !result.error && <p role="status" className="text-sm text-muted-foreground">{result.data?.safeError ?? (result.data?.state === "not_saved" ? "No enquiry was saved in this preview." : result.data?.state === "unknown" ? "The result is uncertain. Check the callback inbox before trying again." : result.data?.state === "failed" ? "The preview could not finish. Resolve the issue before starting another preview." : sessionId ? "The preview is in progress. Confirm an enquiry during the call to test saving." : "No preview result yet. Try the saved brief, then confirm a test enquiry.")}</p>}
        </GlassCard>
      </div>
    </div>
  </div>;
}
