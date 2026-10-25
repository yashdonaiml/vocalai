import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { GlassCard, SystemLabel } from "@/components/apple";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/notify";
import {
  beginPhoneTest,
  checkManagedPhoneOrder,
  confirmPhoneTest,
  getManagedPhoneOverview,
  getPhoneTest,
  purchaseManagedPhoneNumber,
  releaseManagedPhoneNumber,
  searchManagedPhoneNumbers,
} from "@/lib/managed-telephony.functions";

type Phone = { id: string; e164: string; management_mode: string; status: string };
type Quote = Awaited<ReturnType<typeof searchManagedPhoneNumbers>>[number];
const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const selectClass = "rounded-md border border-input bg-background px-3 py-2 text-sm";

export function ManagedInbound({
  workspaceId,
  numbers,
  deployments,
  agents,
  environments,
}: {
  workspaceId: string;
  numbers: Phone[];
  deployments: { agent_id: string; environment_id: string; agent_version: number }[];
  agents: { id: string; name: string }[];
  environments: { id: string; name: string }[];
}) {
  const qc = useQueryClient();
  const overviewFn = useServerFn(getManagedPhoneOverview),
    searchFn = useServerFn(searchManagedPhoneNumbers),
    buyFn = useServerFn(purchaseManagedPhoneNumber);
  const checkFn = useServerFn(checkManagedPhoneOrder),
    releaseFn = useServerFn(releaseManagedPhoneNumber);
  const overview = useQuery({
    queryKey: ["managed-phones", workspaceId],
    queryFn: () => overviewFn({ data: { workspaceId } }),
    refetchInterval: 15_000,
  });
  const [areaCode, setAreaCode] = useState("");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selected, setSelected] = useState<Quote | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [deploymentIndex, setDeploymentIndex] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeOrder, setActiveOrder] = useState<string | null>(null);
  const [requests, setRequests] = useState<Record<string, string>>({});
  const usableDeployments = deployments.filter(
    (d) =>
      agents.some((a) => a.id === d.agent_id) &&
      environments.some((e) => e.id === d.environment_id),
  );
  const chosenDeployment = usableDeployments.find(
    (d) => `${d.agent_id}:${d.environment_id}` === deploymentIndex,
  );
  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["managed-phones", workspaceId] }),
      qc.invalidateQueries({ queryKey: ["telephony", workspaceId] }),
    ]);
  }
  // Only the admin who starts/checks setup drives this poll; server cron also recovers abandoned setup.
  const activeOrderState = overview.data?.orders.find((o) => o.id === activeOrder)?.state;
  useEffect(() => {
    if (!activeOrder) return;
    if (activeOrderState && ["ready", "released", "failed", "review"].includes(activeOrderState))
      return;
    const timer = setInterval(() => {
      void checkFn({ data: { workspaceId, orderId: activeOrder } })
        .then(() =>
          Promise.all([
            qc.invalidateQueries({ queryKey: ["managed-phones", workspaceId] }),
            qc.invalidateQueries({ queryKey: ["telephony", workspaceId] }),
          ]),
        )
        .catch(() => setActiveOrder(null));
    }, 20_000);
    return () => clearInterval(timer);
  }, [activeOrder, activeOrderState, checkFn, qc, workspaceId]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSelected(null);
    setAccepted(false);
    try {
      const result = await searchFn({ data: { workspaceId, areaCode: areaCode || undefined } });
      setQuotes(result);
      if (!result.length) toast.error("No numbers available at this price. Try another area code.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not search numbers");
    } finally {
      setBusy(false);
    }
  }
  async function buy() {
    if (!selected || !chosenDeployment || !accepted) return;
    setBusy(true);
    const requestId = requests[selected.id] ?? crypto.randomUUID();
    setRequests((old) => ({ ...old, [selected.id]: requestId }));
    try {
      const result = await buyFn({
        data: {
          workspaceId,
          quoteId: selected.id,
          requestId,
          agentId: chosenDeployment.agent_id,
          environmentId: chosenDeployment.environment_id,
          acceptCharges: true,
        },
      });
      setActiveOrder(result.orderId);
      setSelected(null);
      setQuotes([]);
      setAccepted(false);
      toast.success("Number requested. Setup progress appears below.");
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Could not request number. Check existing orders before trying again.",
      );
    } finally {
      setBusy(false);
      await refresh();
    }
  }
  async function check(orderId: string) {
    setBusy(true);
    setActiveOrder(orderId);
    try {
      await checkFn({ data: { workspaceId, orderId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not check setup");
    } finally {
      setBusy(false);
      await refresh();
    }
  }
  async function release(orderId: string, e164: string) {
    if (
      !confirm(
        `Release ${e164}? Incoming calls will stop and you may not be able to recover this number. Accrued charges remain due; future rental stops after release completes.`,
      )
    )
      return;
    setBusy(true);
    setActiveOrder(orderId);
    try {
      await releaseFn({ data: { workspaceId, orderId, confirmRelease: true } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not release number");
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  return (
    <div className="mb-6 space-y-4">
      <GlassCard className="space-y-4">
        <div>
          <h2 className="font-semibold">Get an inbound number</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a number, assign a deployed agent, then call it from your phone. aviroh handles
            the connection.
          </p>
        </div>
        <ol className="grid gap-2 text-sm sm:grid-cols-3">
          <li>1. Choose your agent</li>
          <li>2. Get your number</li>
          <li>3. Test a real call</li>
        </ol>
        {overview.isPending ? (
          <p className="text-sm text-muted-foreground">Checking number availability…</p>
        ) : overview.isError ? (
          <p role="alert" className="text-sm text-warning">
            Could not load managed calling.{" "}
            <button className="underline" onClick={() => overview.refetch()}>
              Try again
            </button>
          </p>
        ) : !overview.data?.setup.available ? (
          <p className="text-sm text-muted-foreground">
            Managed calling is being enabled for this platform. Contact aviroh support. You do not
            need a carrier account.
          </p>
        ) : (
          <>
            <label className="block space-y-1 text-sm">
              <span>Agent and environment</span>
              <select
                className={`${selectClass} w-full`}
                value={deploymentIndex}
                onChange={(e) => {
                  setDeploymentIndex(e.target.value);
                  setAccepted(false);
                }}
              >
                <option value="">Choose a deployed agent</option>
                {usableDeployments.map((d) => (
                  <option
                    key={`${d.agent_id}:${d.environment_id}`}
                    value={`${d.agent_id}:${d.environment_id}`}
                  >
                    {agents.find((a) => a.id === d.agent_id)?.name} ·{" "}
                    {environments.find((e) => e.id === d.environment_id)?.name} · v{d.agent_version}
                  </option>
                ))}
              </select>
            </label>
            {!usableDeployments.length && (
              <p className="text-sm text-muted-foreground">
                Publish an agent, add its provider keys in{" "}
                <Link to="/models" className="underline">
                  Models & Keys
                </Link>
                , and create a full deployment in{" "}
                <Link to="/deployments" className="underline">
                  Deployments
                </Link>{" "}
                first.
              </p>
            )}
            <form onSubmit={search} className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-sm">
                <span>United States area code (optional)</span>
                <Input
                  placeholder="312"
                  aria-label="US area code"
                  inputMode="numeric"
                  pattern="[2-9][0-9]{2}"
                  maxLength={3}
                  value={areaCode}
                  onChange={(e) => setAreaCode(e.target.value)}
                />
              </label>
              <Button disabled={busy || !chosenDeployment}>Find numbers</Button>
            </form>
            <div className="grid gap-2 sm:grid-cols-2">
              {quotes.map((q) => (
                <button
                  type="button"
                  key={q.id}
                  disabled={busy}
                  onClick={() => {
                    setSelected(q);
                    setAccepted(false);
                  }}
                  aria-pressed={selected?.id === q.id}
                  className={`rounded-xl border p-3 text-left ${selected?.id === q.id ? "border-primary bg-accent" : "border-border"}`}
                >
                  <span className="font-mono">{q.e164}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {q.locality} · {money(q.monthly_cents)}/month · {money(q.setup_cents)} setup
                  </span>
                </button>
              ))}
            </div>
            {selected && (
              <div className="space-y-3 rounded-xl border border-border p-4">
                <h3 className="font-medium">Review {selected.e164}</h3>
                <p className="text-sm">
                  {money(selected.monthly_cents + selected.setup_cents)} initially, then{" "}
                  {money(selected.monthly_cents)} each month until released. Inbound calls: $
                  {selected.inbound_rate}/minute. Taxes may apply.
                </p>
                <p className="text-xs text-muted-foreground">
                  Availability is confirmed on purchase. This quote expires at{" "}
                  {new Date(selected.expires_at).toLocaleTimeString()}. Charges are recorded to your
                  workspace.
                </p>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                  />
                  <span>
                    I agree to the setup, recurring rental and inbound usage charges shown above.
                  </span>
                </label>
                <Button
                  disabled={
                    busy ||
                    !accepted ||
                    !chosenDeployment ||
                    Date.parse(selected.expires_at) <= Date.now()
                  }
                  onClick={buy}
                >
                  {busy ? "Requesting…" : "Get number and connect agent"}
                </Button>
              </div>
            )}
          </>
        )}
      </GlassCard>
      {overview.data?.orders
        .filter((o) => o.state !== "released")
        .map((order) => {
          const number = numbers.find((n) => n.id === order.number_id);
          return (
            <GlassCard key={order.id} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-mono font-semibold">{number?.e164 ?? "Your number"}</h3>
                <SystemLabel tone={order.state === "ready" ? "ok" : "warn"}>
                  {(
                    {
                      reserved: "Number requested",
                      ordering: "Confirming purchase",
                      activation: "Activating",
                      routing: "Connecting agent",
                      ready: "Ready to call",
                      error: "Setup needs attention",
                      review: "Awaiting confirmation",
                      releasing: "Release pending",
                      failed: "Purchase needs support",
                    } as Record<string, string>
                  )[order.state] ?? "Processing"}
                </SystemLabel>
              </div>
              {order.price && (
                <p className="text-xs text-muted-foreground">
                  {money(order.price.monthly_cents)}/month · ${order.price.inbound_rate}/minute
                  inbound
                </p>
              )}
              {order.error && (
                <p role="status" className="text-sm text-warning">
                  {order.error}
                </p>
              )}
              {order.state === "ready" && number && (
                <PhoneTest workspaceId={workspaceId} numberId={number.id} e164={number.e164} />
              )}
              <div className="flex flex-wrap gap-2">
                {order.state !== "failed" && order.state !== "ready" && (
                  <Button variant="outline" disabled={busy} onClick={() => check(order.id)}>
                    {busy ? "Checking…" : "Check setup"}
                  </Button>
                )}
                {order.canRelease && order.state !== "releasing" && number && (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => release(order.id, number.e164)}
                  >
                    {order.cancelOnly ? "Cancel request" : "Release number"}
                  </Button>
                )}
                {order.state === "failed" && (
                  <p className="text-sm text-muted-foreground">
                    Contact aviroh support to resolve the order before requesting another number.
                  </p>
                )}
              </div>
            </GlassCard>
          );
        })}
      {!!overview.data?.accruedNumberCents && (
        <p className="text-xs text-muted-foreground">
          Recorded number charges: {money(overview.data.accruedNumberCents)}. Inbound usage:{" "}
          {money(overview.data.accruedCallCents)}. Taxes are separate.
        </p>
      )}
    </div>
  );
}

function PhoneTest({
  workspaceId,
  numberId,
  e164,
}: {
  workspaceId: string;
  numberId: string;
  e164: string;
}) {
  const get = useServerFn(getPhoneTest),
    start = useServerFn(beginPhoneTest),
    confirmTest = useServerFn(confirmPhoneTest);
  const qc = useQueryClient();
  const test = useQuery({
    queryKey: ["phone-test", workspaceId, numberId],
    queryFn: () => get({ data: { workspaceId, numberId } }),
    refetchInterval: (query) => query.state.data?.state && ["verified", "changed", "expired"].includes(query.state.data.state) ? false : 5_000,
  });
  const [busy, setBusy] = useState(false);
  async function act(confirmAudio: boolean) {
    setBusy(true);
    try {
      if (confirmAudio) await confirmTest({ data: { workspaceId, numberId, heardAgent: true } });
      else await start({ data: { workspaceId, numberId } });
      await Promise.all([
        test.refetch(),
        qc.invalidateQueries({ queryKey: ["telephony", workspaceId] }),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update phone test");
    } finally {
      setBusy(false);
    }
  }
  const state = test.data?.state;
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <h4 className="text-sm font-medium">Test your agent</h4>
      {state === "verified" ? (
        <SystemLabel tone="ok">Test call verified</SystemLabel>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Start a test, dial{" "}
            <a href={`tel:${e164}`} className="font-mono underline">
              {e164}
            </a>{" "}
            from your phone, say the test phrase <span className="font-mono font-semibold">{test.data?.challenge ?? "shown after you start"}</span>, exchange a few words with your agent, then hang up. Tests expire after 30 minutes.
          </p>
          {(!state || ["changed", "incomplete", "waiting", "in_progress", "expired"].includes(state)) && (
            <Button variant="outline" disabled={busy || test.isPending} onClick={() => act(false)}>
              {state === "changed" ? "Agent changed — start new test" : ["waiting", "in_progress"].includes(state ?? "") ? "Restart test" : "Start test call"}
            </Button>
          )}
          {state === "waiting" && <SystemLabel tone="warn">Waiting for your call</SystemLabel>}
          {state === "in_progress" && (
            <SystemLabel tone="live">Call in progress — hang up when finished</SystemLabel>
          )}
          {state === "incomplete" && (
            <p className="text-sm text-warning">
              The call did not complete with speech in both directions. Check your agent deployment
              and provider keys, then retry. Contact support if it persists.
            </p>
          )}
          {state === "expired" && <SystemLabel tone="warn">This test expired. Start a new test to verify the current route.</SystemLabel>}
          {state === "confirm_audio" && (
            <>
              <p className="text-sm">
                The call completed and speech was saved in both directions. Did you hear your agent
                clearly?
              </p>
              <Button disabled={busy} onClick={() => act(true)}>
                Yes, I heard the agent
              </Button>
            </>
          )}
        </>
      )}
      {test.isError && (
        <p role="alert" className="text-sm text-warning">
          Could not check test progress.{" "}
          <button className="underline" onClick={() => test.refetch()}>
            Retry
          </button>
        </p>
      )}
      {test.data?.conversationId && (
        <Link
          to="/conversations/$id"
          params={{ id: test.data.conversationId }}
          className="block text-xs underline"
        >
          View test conversation
        </Link>
      )}
    </div>
  );
}
