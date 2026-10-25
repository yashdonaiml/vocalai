// Event outbox (ENG-TOOLS-001 section 13). domain_events.payload holds IDs and minimal facts only:
// never transcripts, arguments, outputs or personal data. Events are delivered to subscribed
// webhook endpoints right after they are written, and the maintenance job retries any left behind.
async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export type DomainEventType = "tool.approved" | "tool.changed" | "tool.call_failed" | "tool.succeeded" | "workflow.published" | "connection.unhealthy";

export async function emitEvent(workspaceId: string, type: DomainEventType, payload: Record<string, string | number | boolean | null>, opts: { background?: boolean } = {}) {
  const db = await admin();
  const { data, error } = await db.from("domain_events").insert({ workspace_id: workspaceId, type, payload: payload as never }).select("id").single();
  if (error || !data) throw new Error("Could not queue the webhook event.");
  if (opts.background) void deliverEvents({ ids: [data.id] }).catch(() => undefined);
  else await deliverEvents({ ids: [data.id] });
}

/** Delivers unprocessed events (oldest first) to enabled webhook endpoints subscribed to the type. */
export async function deliverEvents(opts: { ids?: string[]; limit?: number } = {}) {
  const db = await admin();
  let q = db.from("domain_events").select("id, workspace_id, type, payload, created_at").is("processed_at", null).order("created_at").limit(opts.limit ?? 25);
  if (opts.ids) q = q.in("id", opts.ids);
  const { data: events, error: eventError } = await q;
  if (eventError) throw new Error("Could not load webhook events.");
  const { decryptSecret, hmacHex } = await import("./crypto.server");
  let delivered = 0, failed = 0;
  for (const ev of events ?? []) {
    const token = crypto.randomUUID();
    const leaseExpired = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: claim, error: claimError } = await db.from("domain_events").update({ delivery_token: token, delivery_lease_at: new Date().toISOString() }).eq("id", ev.id).is("processed_at", null).or(`delivery_lease_at.is.null,delivery_lease_at.lt.${leaseExpired}`).select("id").maybeSingle();
    if (claimError) throw new Error("Could not claim webhook event delivery.");
    if (!claim) continue;
    const { data: eps, error: endpointError } = await db.from("webhook_endpoints").select("id, url, events, secret_ciphertext").eq("workspace_id", ev.workspace_id).eq("enabled", true);
    if (endpointError) {
      failed++;
      await db.from("domain_events").update({ delivery_token: null, delivery_lease_at: null }).eq("id", ev.id).eq("delivery_token", token);
      continue;
    }
    const subscribers = (eps ?? []).filter((e) => (e.events as string[] | null)?.includes(ev.type));
    let eventFailed = false;
    for (const ep of subscribers) {
      const { data: prior, error: priorError } = await db.from("webhook_deliveries").select("status").eq("domain_event_id", ev.id).eq("endpoint_id", ep.id);
      if (priorError) { eventFailed = true; failed++; continue; }
      if ((prior ?? []).some((delivery) => delivery.status != null && delivery.status >= 200 && delivery.status < 300)) continue;
      const ts = Math.floor(Date.now() / 1000).toString();
      const body = JSON.stringify({ id: ev.id, type: ev.type, created_at: ev.created_at, data: ev.payload });
      const sig = await hmacHex(await decryptSecret(ep.secret_ciphertext), `${ts}.${body}`);
      const t0 = Date.now();
      let status: number | null = null, error: string | null = null;
      try {
        const { guardedFetch } = await import("./tools/egress.server");
        const res = await guardedFetch(ep.url, { method: "POST", headers: new Headers({ "content-type": "application/json", "x-aviroh-timestamp": ts, "x-aviroh-signature": sig }), body, timeoutMs: 8000, maxBytes: 65536 });
        status = res.status;
        if (status < 200 || status >= 300) error = `Receiver answered ${status}`;
      } catch (e) { error = e instanceof Error ? e.message : "Delivery failed"; }
      const { error: saveError } = await db.from("webhook_deliveries").insert({ endpoint_id: ep.id, workspace_id: ev.workspace_id, domain_event_id: ev.id, event: ev.type, status, error, duration_ms: Date.now() - t0 });
      if (saveError || error) { eventFailed = true; failed++; }
      else delivered++;
    }
    if (!eventFailed) {
      const { error: completeError } = await db.from("domain_events").update({ processed_at: new Date().toISOString(), delivery_token: null, delivery_lease_at: null }).eq("id", ev.id).eq("delivery_token", token);
      if (completeError) { failed++; continue; }
    } else {
      const { error: releaseError } = await db.from("domain_events").update({ delivery_token: null, delivery_lease_at: null }).eq("id", ev.id).eq("delivery_token", token);
      if (releaseError) failed++;
    }
  }
  return { events: events?.length ?? 0, delivered, failed };
}
