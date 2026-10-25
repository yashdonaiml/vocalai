import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "@/lib/notify";
import { GlassCard, PageHeader, Pill } from "@/components/apple";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestSupportAccess, searchOrgs } from "@/lib/internal.functions";

export const Route = createFileRoute("/internal/orgs")({ component: Orgs });

type Org = Awaited<ReturnType<typeof searchOrgs>>[number];

function Orgs() {
  const search = useServerFn(searchOrgs);
  const request = useServerFn(requestSupportAccess);
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Org[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState(2);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try { setResults(await search({ data: { query } })); } catch (err) { toast.error(err instanceof Error ? err.message : "Search failed"); } finally { setBusy(false); }
  }

  async function onRequest(orgId: string) {
    try {
      await request({ data: { orgId, reason, hours } });
      toast.success("Access request submitted for admin approval");
      setRequesting(null); setReason("");
      qc.invalidateQueries({ queryKey: ["internal-access"] });
    } catch (err) { toast.error(err instanceof Error ? err.message : "Request failed"); }
  }

  return (
    <>
      <PageHeader eyebrow="Internal" title="Organization lookup" subtitle="Redacted summaries only. Transcripts, keys and member emails are never shown. Every lookup is audited." />
      <form onSubmit={onSearch} className="flex max-w-lg gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Organization name" minLength={2} maxLength={80} required aria-label="Search organizations" />
        <Button type="submit" disabled={busy}>Search</Button>
      </form>
      <div className="mt-4 space-y-3">
        {results?.length === 0 && <p className="text-sm text-muted-foreground">No organizations match.</p>}
        {results?.map((o) => (
          <GlassCard key={o.id}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium">{o.name}</h3>
              <span className="font-mono text-xs text-muted-foreground">{o.id.slice(0, 8)}</span>
              <span className="ml-auto text-xs text-muted-foreground">Created {new Date(o.created_at).toLocaleDateString()}</span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 font-mono text-sm sm:grid-cols-4">
              <div><dt className="font-sans text-xs text-muted-foreground">Members</dt><dd>{o.members}</dd></div>
              <div><dt className="font-sans text-xs text-muted-foreground">Workspaces</dt><dd>{o.workspaces}</dd></div>
              <div><dt className="font-sans text-xs text-muted-foreground">Agents</dt><dd>{o.agents}</dd></div>
              <div><dt className="font-sans text-xs text-muted-foreground">Conversations 30d</dt><dd>{o.conversations30d}</dd></div>
            </dl>
            <div className="mt-3 flex flex-wrap items-center gap-1">
              <span className="text-xs text-muted-foreground">BYOK:</span>
              {o.byok.length ? o.byok.map((p) => <Pill key={p}>{p}</Pill>) : <span className="text-xs text-muted-foreground">none</span>}
            </div>
            {requesting === o.id ? (
              <div className="mt-3 grid gap-2">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, including ticket reference (min 10 characters)" aria-label="Reason" />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground" htmlFor={`h-${o.id}`}>Hours</label>
                  <Input id={`h-${o.id}`} type="number" min={1} max={24} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-20" />
                  <Button size="sm" disabled={reason.trim().length < 10} onClick={() => onRequest(o.id)}>Submit request</Button>
                  <Button size="sm" variant="ghost" onClick={() => setRequesting(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="mt-3" onClick={() => setRequesting(o.id)}>Request support access</Button>
            )}
          </GlassCard>
        ))}
      </div>
    </>
  );
}
