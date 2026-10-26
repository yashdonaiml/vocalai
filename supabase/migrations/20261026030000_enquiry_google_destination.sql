-- Persist the one destination selected by the guided enquiry setup. The
-- destination changes the setup revision so previously issued preview
-- authority cannot be reused after an owner changes the target sheet.

alter table public.agent_setup_runs
  add column destination_kind text not null default 'callback_inbox'
    check (destination_kind in ('callback_inbox', 'google_sheets')),
  add column google_connection_id uuid,
  add column google_sheet_destination jsonb,
  add column destination_updated_at timestamptz;

alter table public.agent_setup_runs
  add constraint agent_setup_google_connection_workspace_fk
    foreign key (google_connection_id, workspace_id)
    references public.google_connections(id, workspace_id) on delete restrict,
  add constraint agent_setup_google_destination_shape check (
    (destination_kind = 'callback_inbox'
      and google_connection_id is null
      and google_sheet_destination is null)
    or
    (destination_kind = 'google_sheets'
      and google_connection_id is not null
      and jsonb_typeof(google_sheet_destination) = 'object')
  );

create index agent_setup_runs_google_connection
  on public.agent_setup_runs(google_connection_id)
  where google_connection_id is not null;
