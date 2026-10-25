import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { GlassCard, PageHeader } from "@/components/apple";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/internal/audit")({ component: Audit });

function Audit() {
  const { data = [] } = useQuery({
    queryKey: ["internal-audit"],
    queryFn: async () => {
      const { data, error } = await supabase.from("internal_audit_events").select("id, actor_id, action, target, metadata, created_at").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });
  return (
    <>
      <PageHeader eyebrow="Internal" title="Internal audit" subtitle="Every staff action, newest first." />
      <GlassCard className="p-0">
        {data.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No staff actions recorded yet.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="p-3">When</th><th className="p-3">Action</th><th className="p-3">Target</th><th className="p-3">Actor</th></tr></thead>
            <tbody className="divide-y divide-border">
              {data.map((e) => (
                <tr key={e.id}>
                  <td className="p-3 font-mono text-xs">{new Date(e.created_at).toLocaleString()}</td>
                  <td className="p-3">{e.action}</td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{e.target ?? ""}</td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{e.actor_id.slice(0, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlassCard>
    </>
  );
}
