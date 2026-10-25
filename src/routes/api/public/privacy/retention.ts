import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/privacy/retention")({
  server: { handlers: { POST: async ({ request }) => {
    const denied = await authenticateCronRequest(request);
    if (denied) return denied;
    try { return Response.json(await (await import("@/lib/privacy.server")).purgeExpiredCallData()); }
    catch { return new Response("Retention cleanup failed", { status: 503 }); }
  } } },
});
