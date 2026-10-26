import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Check, Loader2, Send, Sparkles, UserRound, X } from "lucide-react";
import { GlassCard, PageHeader, SystemLabel } from "@/components/apple";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  applyBuilderProposal,
  getBuilderConversation,
  proposeBuilderChange,
  rejectBuilderProposal,
} from "@/lib/builder-chat.functions";
import { summarizeProfileChange } from "@/lib/builder-chat";
import { developerStudioAccess } from "@/lib/developer-access.functions";

function conversationKey(workspaceId: string, agentId: string) {
  const storageKey = `vocollai-builder:${workspaceId}:${agentId}`;
  const saved = window.localStorage.getItem(storageKey);
  if (saved) return saved;
  const created = crypto.randomUUID();
  window.localStorage.setItem(storageKey, created);
  return created;
}

export function AgentBuilderChat({
  workspaceId,
  agentId,
}: {
  workspaceId: string;
  agentId: string;
}) {
  const getConversation = useServerFn(getBuilderConversation);
  const propose = useServerFn(proposeBuilderChange);
  const apply = useServerFn(applyBuilderProposal);
  const reject = useServerFn(rejectBuilderProposal);
  const checkDeveloperAccess = useServerFn(developerStudioAccess);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [key] = useState(() => conversationKey(workspaceId, agentId));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [safeError, setSafeError] = useState<string | null>(null);
  const queryKey = useMemo(
    () => ["agent-builder-conversation", workspaceId, agentId, key] as const,
    [agentId, key, workspaceId],
  );
  const conversation = useQuery({
    queryKey,
    queryFn: () =>
      getConversation({
        data: { workspaceId, agentId, conversationKey: key },
      }),
    retry: false,
  });
  const developerAccess = useQuery({
    queryKey: ["developer-studio-access", workspaceId],
    queryFn: () => checkDeveloperAccess({ data: { workspaceId } }),
    retry: false,
  });

  useEffect(() => {
    if (!conversation.error) return;
    setSafeError(
      conversation.error instanceof Error
        ? conversation.error.message
        : "The builder conversation could not be loaded.",
    );
  }, [conversation.error]);

  async function send() {
    const text = message.trim();
    if (!text || busy) return;
    setBusy(true);
    setSafeError(null);
    const requestKey = crypto.randomUUID();
    try {
      await propose({
        data: {
          workspaceId,
          agentId,
          conversationKey: key,
          requestKey,
          message: text,
          browserTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        },
      });
      setMessage("");
      await queryClient.invalidateQueries({ queryKey });
    } catch (error) {
      setSafeError(
        error instanceof Error ? error.message : "The builder could not prepare a proposal.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function applyProposal(proposalId: string) {
    if (busy) return;
    setBusy(true);
    setSafeError(null);
    const requestKey = crypto.randomUUID();
    try {
      const result = await apply({
        data: {
          workspaceId,
          agentId,
          conversationKey: key,
          proposalId,
          requestKey,
        },
      });
      if (agentId === "new") {
        window.localStorage.setItem(`vocollai-builder:${workspaceId}:${result.agentId}`, key);
        await navigate({
          to: "/builder/$agentId",
          params: { agentId: result.agentId },
          replace: true,
        });
      } else {
        await queryClient.invalidateQueries({ queryKey });
      }
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
      await queryClient.invalidateQueries({ queryKey: ["overview", workspaceId] });
    } catch (error) {
      setSafeError(error instanceof Error ? error.message : "The proposal could not be applied.");
    } finally {
      setBusy(false);
    }
  }

  async function rejectProposal(proposalId: string) {
    if (busy) return;
    setBusy(true);
    setSafeError(null);
    try {
      await reject({
        data: { workspaceId, agentId, conversationKey: key, proposalId },
      });
      await queryClient.invalidateQueries({ queryKey });
    } catch (error) {
      setSafeError(error instanceof Error ? error.message : "The proposal could not be dismissed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Link to="/agents" className="text-sm text-muted-foreground hover:text-foreground">
          Back to agents
        </Link>
        {agentId !== "new" && developerAccess.data?.allowed && (
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
        eyebrow="Chat Builder"
        title={agentId === "new" ? "What should your agent do?" : "Improve your agent"}
        subtitle="Describe the business job in your own words. VocollAI will ask for missing facts, prepare a reviewable proposal, and never publish or purchase anything without approval."
      />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <GlassCard className="min-h-[620px]">
          <div className="space-y-5" aria-live="polite">
            {!conversation.isLoading && (conversation.data?.proposals.length ?? 0) === 0 && (
              <div className="rounded-2xl border border-border bg-muted/40 p-4">
                <div className="flex items-center gap-2 font-medium">
                  <Sparkles className="h-4 w-4 text-primary" /> Start with the outcome
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  For example: “I run a plumbing company. Answer calls after hours, collect the
                  customer’s problem and phone number, and save confirmed requests to Google
                  Sheets.”
                </p>
              </div>
            )}
            {conversation.data?.proposals.map((proposal) => {
              const changes = proposal.proposedProfile
                ? summarizeProfileChange(conversation.data.currentProfile, proposal.proposedProfile)
                : [];
              return (
                <div key={proposal.id} className="space-y-3">
                  <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm text-primary-foreground">
                    <p className="mb-1 flex items-center gap-2 text-xs opacity-80">
                      <UserRound className="h-3.5 w-3.5" /> You
                    </p>
                    <p className="whitespace-pre-wrap">{proposal.userMessage}</p>
                  </div>
                  <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 text-sm">
                    <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Bot className="h-3.5 w-3.5" /> VocollAI
                    </p>
                    <p className="whitespace-pre-wrap leading-6">{proposal.assistantMessage}</p>
                    {proposal.questions.length > 0 && (
                      <ul className="mt-3 list-disc space-y-1 pl-5 text-muted-foreground">
                        {proposal.questions.map((question) => (
                          <li key={question}>{question}</li>
                        ))}
                      </ul>
                    )}
                    {proposal.proposedProfile && (
                      <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">Proposed agent</p>
                          <SystemLabel
                            tone={
                              proposal.status === "applied"
                                ? "ok"
                                : proposal.status === "rejected"
                                  ? "muted"
                                  : "live"
                            }
                          >
                            {proposal.status === "applied"
                              ? "Applied"
                              : proposal.status === "rejected"
                                ? "Dismissed"
                                : "Review required"}
                          </SystemLabel>
                        </div>
                        <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                          {changes.map((change) => (
                            <li key={change} className="flex gap-2">
                              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {change}
                            </li>
                          ))}
                          <li className="flex gap-2">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> Outcome:{" "}
                            {proposal.requestedDestination === "google_sheets"
                              ? "save confirmed requests to Google Sheets"
                              : "save confirmed requests to the callback inbox"}
                          </li>
                        </ul>
                        {proposal.assumptions.length > 0 && (
                          <div className="mt-3 border-t border-border pt-3">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Assumptions to review
                            </p>
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                              {proposal.assumptions.map((assumption) => (
                                <li key={assumption}>{assumption}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {proposal.status === "proposed" && proposal.questions.length === 0 && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button disabled={busy} onClick={() => void applyProposal(proposal.id)}>
                              <Check /> Approve changes
                            </Button>
                            <Button
                              variant="outline"
                              disabled={busy}
                              onClick={() => void rejectProposal(proposal.id)}
                            >
                              <X /> Dismiss
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {conversation.isLoading && (
              <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading your conversation…
              </p>
            )}
          </div>

          {safeError && (
            <p
              role="alert"
              className="mt-5 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm"
            >
              {safeError}
            </p>
          )}
          <form
            className="mt-6 border-t border-border pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <label className="sr-only" htmlFor="builder-message">
              Tell VocollAI what the agent should do
            </label>
            <Textarea
              id="builder-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={4}
              maxLength={4000}
              disabled={busy}
              placeholder="Describe the job, or tell VocollAI what to change…"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Enter sends. Shift+Enter adds a new line.
              </p>
              <Button type="submit" disabled={busy || !message.trim()}>
                {busy ? <Loader2 className="animate-spin" /> : <Send />} Send
              </Button>
            </div>
          </form>
        </GlassCard>

        <div className="space-y-4">
          <GlassCard>
            <p className="text-sm font-semibold">Launch progress</p>
            <ol className="mt-3 space-y-3 text-sm">
              <li>
                <SystemLabel tone={conversation.data?.currentProfile ? "ok" : "live"}>
                  1
                </SystemLabel>
                <span className="ml-2">Describe and approve the agent</span>
              </li>
              <li>
                <SystemLabel tone="muted">2</SystemLabel>
                <span className="ml-2">Connect the destination</span>
              </li>
              <li>
                <SystemLabel tone="muted">3</SystemLabel>
                <span className="ml-2">Run practice and a real test</span>
              </li>
              <li>
                <SystemLabel tone="muted">4</SystemLabel>
                <span className="ml-2">Choose a phone number</span>
              </li>
              <li>
                <SystemLabel tone="muted">5</SystemLabel>
                <span className="ml-2">Review and activate</span>
              </li>
            </ol>
          </GlassCard>
          <GlassCard>
            <p className="text-sm font-semibold">Safety boundary</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              The builder prepares drafts. Connecting an account, writing a test record, buying a
              number, and activating live calls always require a separate explicit approval.
            </p>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
