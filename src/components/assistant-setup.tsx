import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCircle2, RefreshCw } from "lucide-react";
import { GlassCard, PageHeader, SectionTitle, SystemLabel } from "@/components/apple";
import { BuilderJourney, type BuilderStage } from "@/components/builder-journey";
import { BusinessProfileEditor } from "@/components/business-profile-editor";
import { TestCall } from "@/components/agent-runtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { BusinessProfileReadiness } from "@/lib/business-profile";
import {
  beginEnquirySetup,
  getEnquirySetup,
  getEnquiryPreviewResult,
  saveEnquirySetup,
  saveEnquirySetupDestination,
  startEnquiryPreview,
} from "@/lib/setup.functions";
import {
  beginGoogleSheetsConnection,
  disconnectGoogleSheetsConnection,
  getGoogleSheetsConnection,
} from "@/lib/google-oauth.functions";
import {
  listGoogleSheetsSpreadsheets,
  listGoogleSheetsWorksheets,
  prepareGoogleSheetsColumns,
  previewGoogleSheetsMapping,
} from "@/lib/google-sheets.functions";

const queryKey = (workspaceId: string, agentId: string) =>
  ["enquiry-setup", workspaceId, agentId] as const;
const terminalStates = new Set(["saved", "not_saved", "unknown", "failed"]);

export function AssistantSetup({
  workspaceId,
  agentId,
  routeBase = "assistant-setup",
}: {
  workspaceId: string;
  agentId: string;
  routeBase?: "assistant-setup" | "builder";
}) {
  const getSetup = useServerFn(getEnquirySetup);
  const beginSetup = useServerFn(beginEnquirySetup);
  const saveSetup = useServerFn(saveEnquirySetup);
  const startPreview = useServerFn(startEnquiryPreview);
  const getResult = useServerFn(getEnquiryPreviewResult);
  const saveDestination = useServerFn(saveEnquirySetupDestination);
  const beginGoogle = useServerFn(beginGoogleSheetsConnection);
  const disconnectGoogle = useServerFn(disconnectGoogleSheetsConnection);
  const getGoogle = useServerFn(getGoogleSheetsConnection);
  const listSpreadsheets = useServerFn(listGoogleSheetsSpreadsheets);
  const listWorksheets = useServerFn(listGoogleSheetsWorksheets);
  const previewMapping = useServerFn(previewGoogleSheetsMapping);
  const prepareColumns = useServerFn(prepareGoogleSheetsColumns);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", brief: "" });
  const [busy, setBusy] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const [safeError, setSafeError] = useState<string | null>(null);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [destinationKind, setDestinationKind] = useState<"callback_inbox" | "google_sheets">(
    "callback_inbox",
  );
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [worksheetId, setWorksheetId] = useState("");
  const [mapping, setMapping] = useState<Record<string, string | null> | null>(null);
  const [approveColumns, setApproveColumns] = useState(false);
  const [profileReadiness, setProfileReadiness] = useState<BusinessProfileReadiness | null>(null);
  const initialized = useRef(false);
  const beginKey = useRef<string | null>(null);
  const previewKey = useRef<string | null>(null);
  const fresh = agentId === "new";
  const storageKey = `enquiry-preview:${workspaceId}:${agentId}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "{}");
      beginKey.current = saved.begin ?? null;
      previewKey.current = saved.preview ?? null;
    } catch {
      /* storage is optional */
    }
  }, [storageKey]);
  function rememberKeys() {
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ begin: beginKey.current, preview: previewKey.current }),
      );
    } catch {
      /* server idempotency remains authoritative */
    }
  }

  const setup = useQuery({
    queryKey: queryKey(workspaceId, agentId),
    queryFn: () => getSetup({ data: { workspaceId, agentId } }),
    enabled: !fresh,
    retry: false,
  });
  const existingAgent = useQuery({
    queryKey: ["enquiry-setup-agent", workspaceId, agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("id,name,description")
        .eq("id", agentId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
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
      setDestinationKind(state.destination.kind);
      if (state.destination.kind === "google_sheets") {
        setSpreadsheetId(state.destination.spreadsheetId);
        setWorksheetId(String(state.destination.worksheetId));
        setMapping(state.destination.mapping);
      }
      initialized.current = true;
    } else if (!setup.isFetching && existingAgent.data) {
      setForm({ name: existingAgent.data.name, brief: existingAgent.data.description ?? "" });
      initialized.current = true;
    }
  }, [state, setup.isFetching, existingAgent.data]);

  const google = useQuery({
    queryKey: ["google-sheets-connection", workspaceId],
    queryFn: () => getGoogle({ data: { workspaceId } }),
    enabled: !!state,
    retry: false,
  });
  useEffect(() => {
    const outcome = new URLSearchParams(window.location.search).get("google");
    if (outcome === "error")
      setSafeError("Google was not connected. Try again and approve the requested access.");
    if (outcome === "connected")
      void qc.invalidateQueries({ queryKey: ["google-sheets-connection", workspaceId] });
    if (outcome) {
      const url = new URL(window.location.href);
      url.searchParams.delete("google");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, [qc, workspaceId]);
  const spreadsheets = useQuery({
    queryKey: ["google-sheets-files", workspaceId],
    queryFn: () => listSpreadsheets({ data: { workspaceId } }),
    enabled: !!state && destinationKind === "google_sheets" && google.data?.connected === true,
    retry: false,
  });
  const worksheets = useQuery({
    queryKey: ["google-sheets-tabs", workspaceId, spreadsheetId],
    queryFn: () => listWorksheets({ data: { workspaceId, spreadsheetId } }),
    enabled: !!state && destinationKind === "google_sheets" && spreadsheetId.length >= 10,
    retry: false,
  });
  const selectedWorksheet = worksheets.data?.worksheets.find(
    (item) => String(item.id) === worksheetId,
  );
  const mappingPreview = useQuery({
    queryKey: ["google-sheets-mapping", workspaceId, spreadsheetId, selectedWorksheet?.title],
    queryFn: () =>
      previewMapping({
        data: { workspaceId, spreadsheetId, worksheetTitle: selectedWorksheet!.title },
      }),
    enabled: !!selectedWorksheet,
    retry: false,
  });
  useEffect(() => {
    if (!mappingPreview.data) return;
    setMapping((current) => current ?? mappingPreview.data.mapping);
    setApproveColumns(mappingPreview.data.systemColumnsMissing.length === 0);
  }, [mappingPreview.data]);

  const result = useQuery({
    queryKey: ["enquiry-preview-result", workspaceId, state?.setupId, sessionId],
    queryFn: () =>
      getResult({ data: { workspaceId, setupId: state!.setupId, sessionId: sessionId! } }),
    enabled: !!state?.setupId && !!sessionId,
    retry: false,
    refetchInterval: (query) => {
      const value = query.state.data;
      if (query.state.error || (value && terminalStates.has(value.state))) return false;
      return 2000;
    },
  });
  const dirty =
    !!state && (form.name !== state.businessDraft.name || form.brief !== state.businessDraft.brief);
  const destinationDirty =
    !!state &&
    (state.destination.kind !== destinationKind ||
      (destinationKind === "google_sheets" &&
        (state.destination.kind !== "google_sheets" ||
          state.destination.spreadsheetId !== spreadsheetId ||
          String(state.destination.worksheetId) !== worksheetId ||
          JSON.stringify(state.destination.mapping) !== JSON.stringify(mapping))));
  useEffect(() => {
    const current = result.data;
    if (current && terminalStates.has(current.state)) {
      previewKey.current = null;
      try {
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({ begin: beginKey.current, preview: previewKey.current }),
        );
      } catch {
        /* server idempotency remains authoritative */
      }
    }
  }, [result.data, storageKey]);
  const valid = form.name.trim().length > 0 && form.brief.trim().length >= 10;
  const preparing = busy || callActive;
  const ready = !!state?.readiness.ready && !dirty && !destinationDirty && !preparing;
  const receipt = !dirty && !destinationDirty ? (result.data?.receipt ?? state?.receipt) : null;
  const businessComplete = state ? (profileReadiness?.business ?? false) : valid && !dirty;
  const behaviorComplete = state ? (profileReadiness?.behavior ?? false) : valid && !dirty;
  const outcomeComplete = !!state && !destinationDirty;
  const testComplete = !!receipt;
  const builderStages: BuilderStage[] = [
    {
      key: "business",
      label: "Business",
      description: businessComplete
        ? "Business details are saved."
        : "Add the facts callers may hear.",
      state: businessComplete ? "complete" : "current",
      href: "#business",
    },
    {
      key: "behavior",
      label: "Behavior",
      description: behaviorComplete
        ? "Response guidance is saved."
        : "Decide what the assistant may say and collect.",
      state: behaviorComplete ? "complete" : businessComplete ? "current" : "waiting",
      href: "#business",
    },
    {
      key: "outcome",
      label: "Outcome",
      description: outcomeComplete
        ? "A destination is saved."
        : "Choose where caller requests should go.",
      state: outcomeComplete ? "complete" : behaviorComplete ? "current" : "waiting",
      href: state ? "#outcome" : undefined,
    },
    {
      key: "test",
      label: "Test",
      description: testComplete
        ? "A caller-confirmed result was saved."
        : "Complete a safe voice test and verify its result.",
      state: testComplete ? "complete" : outcomeComplete ? "current" : "waiting",
      href: state ? "#test" : undefined,
    },
    {
      key: "activate",
      label: "Activate",
      description: "Requires completed checks and a ready phone number.",
      state: "unavailable",
    },
  ];
  const savingResult =
    disconnected &&
    !!sessionId &&
    !result.error &&
    (!result.data || !terminalStates.has(result.data.state));

  async function save() {
    if (!valid || preparing || (!fresh && !state && !replaceConfirmed)) return;
    setBusy(true);
    setSafeError(null);
    try {
      if (state) {
        const next = await saveSetup({
          data: {
            workspaceId,
            setupId: state.setupId,
            expectedRevision: state.revision,
            businessDraft: { name: form.name.trim(), brief: form.brief.trim() },
          },
        });
        qc.setQueryData(queryKey(workspaceId, agentId), next);
        setForm(next.businessDraft);
        setSessionId(null);
        setDisconnected(false);
        previewKey.current = null;
        rememberKeys();
      } else {
        beginKey.current ??= crypto.randomUUID();
        rememberKeys();
        const created = await beginSetup({
          data: {
            workspaceId,
            ...(fresh ? {} : { agentId }),
            name: form.name.trim(),
            brief: form.brief.trim(),
            requestKey: beginKey.current,
          },
        });
        await qc.invalidateQueries({ queryKey: ["agents"] });
        await qc.invalidateQueries({ queryKey: ["overview", workspaceId] });
        try {
          sessionStorage.removeItem(storageKey);
        } catch {
          /* optional */
        }
        if (routeBase === "builder") {
          await navigate({
            to: "/builder/$agentId",
            params: { agentId: created.agentId },
            replace: true,
          });
        } else {
          await navigate({
            to: "/assistant-setup/$agentId",
            params: { agentId: created.agentId },
            replace: true,
          });
        }
        await qc.invalidateQueries({ queryKey: queryKey(workspaceId, created.agentId) });
      }
    } catch (error) {
      setSafeError(
        error instanceof Error ? error.message : "Could not save your business brief. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function startSession() {
    if (!state || !ready)
      throw new Error(
        "Save your brief and resolve the readiness checks before starting a preview.",
      );
    previewKey.current ??= crypto.randomUUID();
    rememberKeys();
    setSafeError(null);
    setDisconnected(false);
    const join = await startPreview({
      data: {
        workspaceId,
        setupId: state.setupId,
        expectedRevision: state.revision,
        requestKey: previewKey.current,
      },
    });
    return join;
  }

  async function connectGoogle() {
    if (!state) return;
    setBusy(true);
    setSafeError(null);
    try {
      const result = await beginGoogle({
        data: { workspaceId, returnTo: `/${routeBase}/${state.agentId}` },
      });
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      setSafeError(error instanceof Error ? error.message : "Could not connect Google.");
      setBusy(false);
    }
  }

  async function disconnectGoogleAccount() {
    setBusy(true);
    setSafeError(null);
    try {
      await disconnectGoogle({ data: { workspaceId } });
      setSpreadsheetId("");
      setWorksheetId("");
      setMapping(null);
      await google.refetch();
    } catch (error) {
      setSafeError(error instanceof Error ? error.message : "Could not disconnect Google.");
    } finally {
      setBusy(false);
    }
  }

  async function persistDestination() {
    if (!state) return;
    setBusy(true);
    setSafeError(null);
    try {
      if (destinationKind === "callback_inbox") {
        const next = await saveDestination({
          data: {
            workspaceId,
            setupId: state.setupId,
            expectedRevision: state.revision,
            destination: { kind: "callback_inbox" },
          },
        });
        qc.setQueryData(queryKey(workspaceId, agentId), next);
      } else {
        const sheet = spreadsheets.data?.items.find((item) => item.id === spreadsheetId);
        const tab = selectedWorksheet;
        if (!sheet || !tab || !mapping)
          throw new Error("Choose a spreadsheet and worksheet first.");
        const prepared = await prepareColumns({
          data: { workspaceId, spreadsheetId, worksheetId: tab.id, approveSystemColumns: true },
        });
        const finalMapping = { ...prepared.destination.mapping, ...mapping };
        for (const field of ["name", "phone", "reason"] as const)
          if (!finalMapping[field]) throw new Error(`Choose a worksheet column for ${field}.`);
        const next = await saveDestination({
          data: {
            workspaceId,
            setupId: state.setupId,
            expectedRevision: state.revision,
            destination: {
              kind: "google_sheets",
              spreadsheetId,
              spreadsheetName: prepared.destination.spreadsheetName,
              worksheetId: tab.id,
              worksheetTitle: prepared.destination.worksheetTitle,
              mapping: finalMapping as {
                name: string;
                phone: string;
                reason: string;
                preferred_time: string | null;
                language: string | null;
                request_marker: string;
                record_kind: string;
              },
            },
          },
        });
        qc.setQueryData(queryKey(workspaceId, agentId), next);
        setMapping(next.destination.kind === "google_sheets" ? next.destination.mapping : null);
      }
      setSessionId(null);
      setDisconnected(false);
      previewKey.current = null;
      rememberKeys();
    } catch (error) {
      setSafeError(error instanceof Error ? error.message : "Could not save this destination.");
    } finally {
      setBusy(false);
    }
  }

  if (!fresh && (setup.isLoading || existingAgent.isLoading))
    return (
      <GlassCard>
        <p role="status">Loading your assistant setup…</p>
      </GlassCard>
    );
  if (!fresh && (setup.error || existingAgent.error || !existingAgent.data))
    return (
      <GlassCard className="space-y-3">
        <h1 className="font-semibold">Setup is unavailable</h1>
        <p className="text-sm text-muted-foreground">
          {setup.error instanceof Error
            ? setup.error.message
            : "This assistant could not be loaded in the selected workspace."}
        </p>
        <Button
          variant="outline"
          onClick={() => {
            void setup.refetch();
            void existingAgent.refetch();
          }}
        >
          <RefreshCw /> Try again
        </Button>
        <Link className="block text-sm text-primary underline" to="/overview">
          Back to Overview
        </Link>
      </GlassCard>
    );

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/overview"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Overview
        </Link>
        {!fresh && (
          <Link
            to="/agents/$id"
            params={{ id: agentId }}
            className="text-sm text-primary underline"
          >
            Advanced Studio
          </Link>
        )}
      </div>
      <PageHeader
        eyebrow="Assistant builder"
        title="Build your assistant"
        subtitle="Teach it about the business, decide how it should respond, choose what happens next, and test it before going live."
      />
      <BuilderJourney stages={builderStages} />
      <GlassCard className="mb-5">
        <SystemLabel tone="warn">Test preview</SystemLabel>
        <p className="mt-2 text-sm text-muted-foreground">
          A preview can save a caller-confirmed test enquiry to the callback inbox or your selected
          Google worksheet. It does not notify anyone, buy a number, publish an agent, or activate
          live calling.
        </p>
      </GlassCard>
      {safeError && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm"
        >
          <p>{safeError}</p>
          {state && !callActive && (
            <Button
              className="mt-3"
              variant="outline"
              onClick={() => {
                previewKey.current = null;
                rememberKeys();
                setSafeError(null);
                setSessionId(null);
                setDisconnected(false);
              }}
            >
              Prepare another test attempt
            </Button>
          )}
        </div>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div id="business">
          {state ? (
            <GlassCard>
              <BusinessProfileEditor
                workspaceId={workspaceId}
                setupId={state.setupId}
                fallbackName={form.name}
                fallbackDescription={form.brief}
                disabled={preparing}
                onReadiness={setProfileReadiness}
                onSaved={async (profile) => {
                  setForm({
                    name: profile.business.name,
                    brief:
                      profile.business.description ??
                      `The business offers: ${profile.services.map((service) => service.name).join(", ")}.`,
                  });
                  setSessionId(null);
                  await setup.refetch();
                }}
              />
            </GlassCard>
          ) : (
            <GlassCard>
              <SectionTitle
                title="1. Describe the business"
                subtitle="Include only facts the assistant may use. It will not invent hours, prices, or policies."
              />
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <label className="block text-sm">
                  Business name
                  <Input
                    required
                    maxLength={120}
                    disabled={preparing}
                    className="mt-1.5"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Northstar Services"
                  />
                </label>
                <label className="block text-sm">
                  What should callers know?
                  <Textarea
                    required
                    minLength={10}
                    maxLength={2000}
                    rows={7}
                    disabled={preparing}
                    className="mt-1.5"
                    value={form.brief}
                    onChange={(e) => setForm({ ...form, brief: e.target.value })}
                    placeholder="We repair household appliances. Take the caller's name, phone number and reason for calling. We cannot promise a return-call time."
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  The assistant collects a name, phone with country code, and reason. Preferred
                  callback time is optional. A saved request is awaiting manual review, not an
                  appointment or a promised callback.
                </p>
                {!fresh && !state && (
                  <label className="flex items-start gap-2 rounded-lg border border-warning/40 p-3 text-sm">
                    <input
                      type="checkbox"
                      disabled={preparing}
                      checked={replaceConfirmed}
                      onChange={(e) => setReplaceConfirmed(e.target.checked)}
                    />
                    <span>
                      Prepare this agent's editable draft for the enquiry preview. This replaces its
                      draft instructions and task setup; published versions stay unchanged.
                    </span>
                  </label>
                )}
                <Button
                  type="submit"
                  disabled={
                    preparing ||
                    !valid ||
                    (!fresh && !state && !replaceConfirmed) ||
                    (!!state && !dirty)
                  }
                >
                  {busy ? "Saving…" : state ? "Save changes" : "Prepare inbox preview"}
                </Button>
                {dirty && (
                  <p role="status" className="text-sm text-warning">
                    Save these changes before testing. Previous test evidence does not apply to the
                    changed brief.
                  </p>
                )}
                {state && !dirty && (
                  <p className="text-xs text-muted-foreground">
                    Saved. You can leave this page and continue later.
                  </p>
                )}
              </form>
            </GlassCard>
          )}
        </div>
        <div className="space-y-5">
          {state && (
            <div id="outcome">
              <GlassCard>
                <SectionTitle
                  title="2. Choose where enquiries go"
                  subtitle="Use the built-in callback inbox, or connect Google and choose a worksheet. No spreadsheet IDs or ranges are required."
                />
                <div className="space-y-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant={destinationKind === "callback_inbox" ? "default" : "outline"}
                      disabled={preparing}
                      onClick={() => setDestinationKind("callback_inbox")}
                    >
                      Callback inbox
                    </Button>
                    <Button
                      type="button"
                      variant={destinationKind === "google_sheets" ? "default" : "outline"}
                      disabled={preparing}
                      onClick={() => setDestinationKind("google_sheets")}
                    >
                      Google Sheets
                    </Button>
                  </div>
                  {destinationKind === "callback_inbox" ? (
                    <p className="text-sm text-muted-foreground">
                      Enquiries stay inside VocollAI for manual review. No notification or callback
                      is promised.
                    </p>
                  ) : google.isLoading ? (
                    <p role="status" className="text-sm text-muted-foreground">
                      Checking Google connection…
                    </p>
                  ) : google.error ? (
                    <div className="space-y-2">
                      <p role="alert" className="text-sm text-warning">
                        Google connection status could not be checked.
                      </p>
                      <Button variant="outline" onClick={() => void google.refetch()}>
                        Try again
                      </Button>
                    </div>
                  ) : google.data?.connected ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm">
                          <SystemLabel tone="ok">Connected</SystemLabel> {google.data.accountEmail}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={preparing}
                          onClick={() => void disconnectGoogleAccount()}
                        >
                          Disconnect
                        </Button>
                      </div>
                      <label className="block text-sm">
                        Spreadsheet
                        <select
                          className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={spreadsheetId}
                          disabled={preparing || spreadsheets.isLoading}
                          onChange={(event) => {
                            setSpreadsheetId(event.target.value);
                            setWorksheetId("");
                            setMapping(null);
                          }}
                        >
                          <option value="">
                            {spreadsheets.isLoading
                              ? "Loading spreadsheets…"
                              : "Choose a spreadsheet"}
                          </option>
                          {spreadsheets.data?.items.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {spreadsheets.error && (
                        <p role="alert" className="text-sm text-warning">
                          Spreadsheets could not be loaded. Reconnect Google or try again.
                        </p>
                      )}
                      {spreadsheetId && (
                        <label className="block text-sm">
                          Worksheet
                          <select
                            className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={worksheetId}
                            disabled={preparing || worksheets.isLoading}
                            onChange={(event) => {
                              setWorksheetId(event.target.value);
                              setMapping(null);
                            }}
                          >
                            <option value="">
                              {worksheets.isLoading ? "Loading worksheets…" : "Choose a worksheet"}
                            </option>
                            {worksheets.data?.worksheets
                              .filter((item) => !item.hidden)
                              .map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.title}
                                </option>
                              ))}
                          </select>
                        </label>
                      )}
                      {mappingPreview.data && mapping && (
                        <div className="space-y-3 rounded-lg border border-border p-3">
                          <p className="text-sm font-medium">Review captured fields</p>
                          {(["name", "phone", "reason", "preferred_time", "language"] as const).map(
                            (field) => (
                              <label
                                key={field}
                                className="grid gap-1 text-xs sm:grid-cols-2 sm:items-center"
                              >
                                <span>
                                  {field.replace("_", " ")}
                                  {["name", "phone", "reason"].includes(field) ? " *" : ""}
                                </span>
                                <select
                                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                                  value={mapping[field] ?? ""}
                                  onChange={(event) =>
                                    setMapping({ ...mapping, [field]: event.target.value || null })
                                  }
                                >
                                  <option value="">
                                    {["name", "phone", "reason"].includes(field)
                                      ? "Choose a column"
                                      : "Do not save"}
                                  </option>
                                  {mappingPreview.data.headers.map((header) => (
                                    <option key={header} value={header}>
                                      {header}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ),
                          )}
                          {mappingPreview.data.systemColumnsMissing.length > 0 && (
                            <label className="flex items-start gap-2 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={approveColumns}
                                onChange={(event) => setApproveColumns(event.target.checked)}
                              />
                              <span>
                                Add two labeled columns for test/live status and duplicate
                                protection. Existing columns and rows are not changed.
                              </span>
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Connect the Google account that owns or can edit the destination
                        spreadsheet.
                      </p>
                      <Button
                        type="button"
                        disabled={preparing}
                        onClick={() => void connectGoogle()}
                      >
                        {google.data?.status === "reconnect_needed"
                          ? "Reconnect Google"
                          : "Connect Google"}
                      </Button>
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      preparing ||
                      !destinationDirty ||
                      (destinationKind === "google_sheets" &&
                        (!google.data?.connected ||
                          !selectedWorksheet ||
                          !mapping ||
                          !approveColumns))
                    }
                    onClick={() => void persistDestination()}
                  >
                    Save destination
                  </Button>
                  {state.destination.kind === destinationKind && (
                    <p className="text-xs text-muted-foreground">
                      Saved destination:{" "}
                      {state.destination.kind === "google_sheets"
                        ? `${state.destination.spreadsheetName} · ${state.destination.worksheetTitle}`
                        : "Callback inbox"}
                      .
                    </p>
                  )}
                </div>
              </GlassCard>
            </div>
          )}
          {!state ? (
            <GlassCard>
              <SectionTitle
                title="3. Speak to your assistant"
                subtitle="Prepare the brief first. Then authorize a real browser voice preview using test contact details."
              />
            </GlassCard>
          ) : (
            <>
              {!state.readiness.ready && (
                <GlassCard>
                  <SectionTitle title="Before the voice preview" />
                  <ul className="list-disc space-y-2 pl-5 text-sm">
                    {state.readiness.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  <Button
                    className="mt-3"
                    variant="outline"
                    disabled={preparing}
                    onClick={() => void setup.refetch()}
                  >
                    <RefreshCw /> Check again
                  </Button>
                </GlassCard>
              )}
              {destinationDirty && (
                <GlassCard>
                  <p role="status" className="text-sm text-warning">
                    Save the destination before starting another preview.
                  </p>
                </GlassCard>
              )}
              <div id="test" />
              <TestCall
                agentId={agentId}
                startSession={startSession}
                disabled={!ready || savingResult}
                onStatusChange={(status) => setCallActive(status !== "idle")}
                onSessionStarted={(id) => {
                  setSessionId(id);
                  setDisconnected(false);
                }}
                onDisconnected={() => {
                  setCallActive(false);
                  setDisconnected(true);
                  void result.refetch();
                }}
                onError={setSafeError}
              />
            </>
          )}
          <GlassCard>
            <SectionTitle
              title="4. Verify the saved result"
              subtitle="Spoken claims and browser captions are not proof. The receipt below comes from the saved call and action records."
            />
            {savingResult && (
              <p role="status" className="text-sm text-muted-foreground">
                The call has ended. Waiting for its saved result…
              </p>
            )}
            {result.error && (
              <div className="space-y-2">
                <p role="alert" className="text-sm text-warning">
                  The saved result could not be checked. This does not mean the request failed or
                  that it is safe to repeat it.
                </p>
                <Button variant="outline" onClick={() => void result.refetch()}>
                  Check saved result
                </Button>
              </div>
            )}
            {receipt ? (
              <div className="space-y-3">
                <SystemLabel tone="ok">
                  <CheckCircle2 className="mr-1 inline h-3 w-3" /> Enquiry saved to{" "}
                  {receipt.destination === "google_sheets" ? "Google Sheets" : "inbox"}
                </SystemLabel>
                <p className="text-sm">
                  Saved {new Date(receipt.savedAt).toLocaleString()}.{" "}
                  {receipt.destination === "google_sheets"
                    ? "This preview row is labeled as a test enquiry."
                    : "Nobody has been notified, and a return call is not guaranteed."}
                </p>
                <p className="break-all font-mono text-xs text-muted-foreground">
                  Request {receipt.invocationId}
                </p>
                <div className="flex flex-wrap gap-3 text-sm">
                  {receipt.destination === "callback_inbox" ? (
                    <Link to="/callbacks" className="text-primary underline">
                      Open callback inbox
                    </Link>
                  ) : receipt.providerLink ? (
                    <a
                      href={receipt.providerLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline"
                    >
                      Open saved test row
                    </a>
                  ) : null}
                  <Link
                    to="/conversations/$id"
                    params={{ id: receipt.conversationId }}
                    className="text-primary underline"
                  >
                    View this call
                  </Link>
                </div>
              </div>
            ) : (
              !savingResult &&
              !result.error && (
                <p role="status" className="text-sm text-muted-foreground">
                  {result.data?.safeError ??
                    (result.data?.state === "not_saved"
                      ? "No enquiry was saved in this preview."
                      : result.data?.state === "unknown"
                        ? "The result is uncertain. Check the callback inbox before trying again."
                        : result.data?.state === "failed"
                          ? "The preview could not finish. Resolve the issue before starting another preview."
                          : sessionId
                            ? "The preview is in progress. Confirm an enquiry during the call to test saving."
                            : "No preview result yet. Try the saved brief, then confirm a test enquiry.")}
                </p>
              )
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
