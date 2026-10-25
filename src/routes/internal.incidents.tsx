import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "@/lib/notify";
import { GlassCard, PageHeader, Pill, SectionTitle } from "@/components/apple";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { saveIncident } from "@/lib/internal.functions";

export const Route = createFileRoute("/internal/incidents")({ component: Incidents });

const SEVERITIES = ["minor", "major", "critical"] as const;
const STATUSES = ["investigating", "identified", "monitoring", "resolved"] as const;
type Incident = { id: string; title: string; severity: (typeof SEVERITIES)[number]; status: (typeof STATUSES)[number]; notes: string; created_at: string; updated_at: string };

function Incidents() {
  const qc = useQueryClient();
  const save = useServerFn(saveIncident);
  const { data = [] } = useQuery({
    queryKey: ["internal-incidents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("platform_incidents").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data as Incident[];
    },
  });
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<Incident["severity"]>("minor");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(input: { id?: string; title: string; severity: Incident["severity"]; status: Incident["status"]; notes: string }) {
    setBusy(true);
    try { await save({ data: input }); toast.success("Incident saved"); qc.invalidateQueries({ queryKey: ["internal-incidents"] }); qc.invalidateQueries({ queryKey: ["internal-audit"] }); return true; }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); return false; }
    finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader eyebrow="Internal" title="Incidents" subtitle="Open, update and resolve platform incidents." />
      <GlassCard>
        <SectionTitle title="Open an incident" />
        <form className="grid gap-3" onSubmit={async (e) => { e.preventDefault(); if (await run({ title, severity, status: "investigating", notes })) { setTitle(""); setNotes(""); } }}>
          <div className="flex flex-wrap gap-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary" className="min-w-60 flex-1" required minLength={3} maxLength={140} aria-label="Incident title" />
            <select value={severity} onChange={(e) => setSeverity(e.target.value as Incident["severity"])} className="h-9 rounded-md border border-border bg-card px-2 text-sm" aria-label="Severity">
              {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What is happening and who is affected" maxLength={4000} aria-label="Notes" />
          <Button type="submit" disabled={busy} className="justify-self-start">Open incident</Button>
        </form>
      </GlassCard>
      <div className="mt-4 space-y-3">
        {data.length === 0 && <p className="text-sm text-muted-foreground">No incidents recorded.</p>}
        {data.map((i) => (
          <GlassCard key={i.id}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium">{i.title}</h3>
              <Pill tone={i.severity === "critical" ? "destructive" : i.severity === "major" ? "warning" : "muted"}>{i.severity}</Pill>
              <Pill tone={i.status === "resolved" ? "success" : "info"} dot>{i.status}</Pill>
              <span className="ml-auto font-mono text-xs text-muted-foreground">{new Date(i.updated_at).toLocaleString()}</span>
            </div>
            {i.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{i.notes}</p>}
            <div className="mt-3 flex flex-wrap gap-1">
              {STATUSES.filter((s) => s !== i.status).map((s) => (
                <Button key={s} size="sm" variant="outline" disabled={busy} onClick={() => run({ id: i.id, title: i.title, severity: i.severity, status: s, notes: i.notes })}>Mark {s}</Button>
              ))}
            </div>
          </GlassCard>
        ))}
      </div>
    </>
  );
}
