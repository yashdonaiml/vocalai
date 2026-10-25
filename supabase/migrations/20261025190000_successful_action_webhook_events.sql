-- Track domain-event ownership on deliveries so successful endpoints are not resent
-- when another endpoint fails and the outbox retries the same event.
alter table public.webhook_deliveries
  add column domain_event_id uuid references public.domain_events(id) on delete cascade;

alter table public.domain_events
  add column delivery_token uuid,
  add column delivery_lease_at timestamptz;

create index webhook_deliveries_event_endpoint
  on public.webhook_deliveries(domain_event_id, endpoint_id, created_at desc);
create index domain_events_delivery_lease
  on public.domain_events(delivery_lease_at)
  where processed_at is null;