import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/notify";
import { GlassCard, PageHeader, Pill } from "@/components/apple";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { decideSupportAccess } from "@/lib/internal.functions";
import { useStaffRole } from "./internal";

export const Route = createFileRoute("/internal/access")({ component: Access });

function Access() {
  const qc = useQueryClient();
  const decide = useServerFn(decideSupportAccess);
  const { data: role } = useStaffRole();
  const { data = [] } = useQuery({
    queryKey: ["internal-access"],
    queryFn: async () => {
      const { data, error } = await supabase.from("support_access_requests").select("id, org_id, reason, duration_hours, status, expires_at, created_at, organizations(name)").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });

  async function onDecide(id: string, approve: boolean) {
    try { await decide({ data: { id, approve } }); toast.success(approve ? "Approved" : "Denied"); qc.invalidateQueries({ queryKey: ["internal-access"] }); qc.invalidateQueries({ queryKey: ["internal-audit"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not update"); }
  }

  const now = Date.now();
  return (
    <>
      <PageHeader eyebrow="Internal" title="Support access" subtitle="Time-limited, justified access requests. Approval needs a second platform admin. Grants are recorded only; they do not open customer data yet." />
      <div className="space-y-3">
        {data.length === 0 && <p className="text-sm text-muted-foreground">No access requests.</p>}
        {data.map((r) => {
          const expired = r.status === "approved" && r.expires_at && new Date(r.expires_at).getTime() < now;
          const label = expired ? "expired" : r.status;
          return (
            <GlassCard key={r.id}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium">{(r.organizations as { name: string } | null)?.name ?? r.org_id}</h3>
                <Pill tone={label === "approved" ? "success" : label === "pending" ? "warning" : "muted"} dot>{label}</Pill>
                <span className="font-mono text-xs text-muted-foreground">{r.duration_hours}h</span>
                <span className="ml-auto font-mono text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{r.reason}</p>
              {r.status === "approved" && r.expires_at && !expired && <p className="mt-1 text-xs text-muted-foreground">Expires {new Date(r.expires_at).toLocaleString()}</p>}
              {r.status === "pending" && role?.role === "admin" && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => onDecide(r.id, true)}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => onDecide(r.id, false)}>Deny</Button>
                </div>
              )}
            </GlassCard>
          );
        })}
      </div>
    </>
  );
}
