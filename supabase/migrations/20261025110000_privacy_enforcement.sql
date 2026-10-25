-- Enforce organization privacy at the persistence/read boundary, including service-role writes.
-- Audio capture is not implemented by the worker: reject a misleading enabled setting.
update public.security_policies set record_calls = false where record_calls;
alter table public.security_policies add constraint audio_recording_unavailable check (record_calls = false);
alter table public.conversations add column privacy_purged_at timestamptz;

create or replace function public.call_retention_days(_ws uuid) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((select p.retention_days from public.workspaces w join public.security_policies p on p.org_id=w.org_id where w.id=_ws),90)
$$;
create or replace function public.call_redaction_enabled(_ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.redact_pii from public.workspaces w join public.security_policies p on p.org_id=w.org_id where w.id=_ws),true)
$$;
create or replace function public.can_read_call_data(_ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_workspace_member(_ws) and (
    coalesce((select p.transcript_access from public.workspaces w join public.security_policies p on p.org_id=w.org_id where w.id=_ws),'member')='member'
    or public.is_workspace_member(_ws,'admin'))
$$;
create or replace function public.call_data_unexpired(_ws uuid, _started timestamptz) returns boolean
language sql stable security definer set search_path = public as $$
  select _started >= now() - make_interval(days=>public.call_retention_days(_ws))
$$;
create or replace function public.call_artifact_unexpired(_ws uuid, _started timestamptz, _conversation uuid, _session text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare c public.conversations%rowtype;
begin
  if not public.call_data_unexpired(_ws,_started) then return false; end if;
  if _conversation is not null or _session ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into c from public.conversations where id=_conversation or id::text=_session limit 1;
    return found and c.workspace_id=_ws and c.privacy_purged_at is null and public.call_data_unexpired(_ws,c.started_at);
  end if;
  return true;
end $$;

-- These deterministic patterns mask email addresses and long digit sequences used by phone/card
-- numbers. This does not claim name/address/medical-entity detection or total anonymization.
create or replace function public.redact_call_text(_text text) returns text
language sql immutable set search_path = public as $$
  select regexp_replace(regexp_replace(_text,
    '[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9-]+([.][A-Za-z0-9-]+)+','[REDACTED_EMAIL]','g'),
    '[+]?[0-9][0-9 ()-]{8,}[0-9]','[REDACTED_NUMBER]','g')
$$;
create or replace function public.redact_call_json(_value jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare out_value jsonb; pair record;
begin
  if _value is null then return null; end if;
  case jsonb_typeof(_value)
    when 'string' then return to_jsonb(public.redact_call_text(_value #>> '{}'));
    when 'array' then select coalesce(jsonb_agg(public.redact_call_json(value)),'[]'::jsonb) into out_value from jsonb_array_elements(_value); return out_value;
    when 'object' then
      out_value := '{}'::jsonb;
      for pair in select * from jsonb_each(_value) loop
        out_value := out_value || jsonb_build_object(pair.key, case when lower(pair.key) in ('phone','phone_number','caller_number','email','email_address','card_number','credit_card','cvv') then to_jsonb('[REDACTED]'::text) else public.redact_call_json(pair.value) end);
      end loop;
      return out_value;
    else return _value;
  end case;
end $$;

create or replace function public.protect_call_content() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.conversations%rowtype;
begin
  if tg_table_name='conversations' then
    if not public.call_data_unexpired(new.workspace_id,new.started_at) or new.privacy_purged_at is not null then new.summary:=null; new.caller_number:=null;
    elsif public.call_redaction_enabled(new.workspace_id) then new.summary:=public.redact_call_text(new.summary); new.caller_number:=case when new.caller_number is null then null else '[REDACTED_NUMBER]' end;
    end if;
  else
    select * into c from public.conversations where id=new.conversation_id;
    if not found or c.workspace_id<>new.workspace_id then raise exception 'Conversation is outside this workspace'; end if;
    if c.privacy_purged_at is not null or not public.call_data_unexpired(c.workspace_id,c.started_at) then raise exception 'Conversation retention expired'; end if;
    if public.call_redaction_enabled(new.workspace_id) then
      if tg_table_name='conversation_turns' then new.content:=public.redact_call_text(new.content);
      else new.tag:=public.redact_call_text(new.tag); end if;
    end if;
  end if;
  return new;
end $$;
create trigger privacy_content before insert or update on public.conversations for each row execute function public.protect_call_content();
create trigger privacy_content before insert or update on public.conversation_turns for each row execute function public.protect_call_content();
create trigger privacy_content before insert or update on public.conversation_tags for each row execute function public.protect_call_content();

-- Restrictive policies combine with existing membership/permission policies, rather than
-- accidentally OR-ing an extra permissive policy into them. Summary/caller metadata is also sensitive.
create policy "privacy call reads" on public.conversations as restrictive for select to authenticated
 using (public.can_read_call_data(workspace_id) and privacy_purged_at is null and public.call_data_unexpired(workspace_id,started_at));
create policy "privacy turn reads" on public.conversation_turns as restrictive for select to authenticated
 using (public.can_read_call_data(workspace_id) and exists(select 1 from public.conversations c where c.id=conversation_id and c.workspace_id=conversation_turns.workspace_id));
create policy "privacy tag reads" on public.conversation_tags as restrictive for select to authenticated
 using (public.can_read_call_data(workspace_id) and exists(select 1 from public.conversations c where c.id=conversation_id and c.workspace_id=conversation_tags.workspace_id));
create policy "privacy tool reads" on public.tool_invocations as restrictive for select to authenticated
 using (public.can_read_call_data(workspace_id) and public.call_artifact_unexpired(workspace_id,started_at,conversation_id,session_id));
create policy "privacy workflow reads" on public.workflow_runs as restrictive for select to authenticated
 using (public.can_read_call_data(workspace_id) and public.call_artifact_unexpired(workspace_id,created_at,conversation_id,null));
create policy "privacy attempt reads" on public.tool_attempts as restrictive for select to authenticated
 using (exists(select 1 from public.tool_invocations i where i.id=invocation_id and i.workspace_id=tool_attempts.workspace_id));
create policy "privacy decision reads" on public.tool_policy_decisions as restrictive for select to authenticated
 using (exists(select 1 from public.tool_invocations i where i.id=invocation_id and i.workspace_id=tool_policy_decisions.workspace_id));

create or replace function public.protect_call_artifacts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name='tool_invocations' then
    if not public.call_artifact_unexpired(new.workspace_id,new.started_at,new.conversation_id,new.session_id) then new.input_redacted:=null; new.output_redacted:=null;
    elsif public.call_redaction_enabled(new.workspace_id) then new.input_redacted:=public.redact_call_json(new.input_redacted); new.output_redacted:=public.redact_call_json(new.output_redacted); end if;
  elsif tg_table_name='workflow_runs' then
    if not public.call_artifact_unexpired(new.workspace_id,new.created_at,new.conversation_id,null) then new.steps:='[]'::jsonb; new.error:=null;
    elsif public.call_redaction_enabled(new.workspace_id) then new.steps:=public.redact_call_json(new.steps); new.error:=public.redact_call_text(new.error); end if;
  end if;
  return new;
end $$;
create trigger privacy_artifacts before insert or update on public.tool_invocations for each row execute function public.protect_call_artifacts();
create trigger privacy_artifacts before insert or update on public.workflow_runs for each row execute function public.protect_call_artifacts();
create or replace function public.protect_pending_call_action() returns trigger
language plpgsql security definer set search_path = public as $$
declare i public.tool_invocations%rowtype;
begin
  select * into i from public.tool_invocations where id=new.invocation_id and workspace_id=new.workspace_id;
  if not found or not public.call_artifact_unexpired(i.workspace_id,i.started_at,i.conversation_id,i.session_id) then raise exception 'Action retention expired'; end if;
  if public.call_redaction_enabled(new.workspace_id) then new.summary:=public.redact_call_text(new.summary); new.evidence:=public.redact_call_json(new.evidence); end if;
  return new;
end $$;
create trigger privacy_pending_action before insert or update on public.tool_pending_actions for each row execute function public.protect_pending_call_action();

-- Immediate expiry is enforced by RLS/API independently of the scheduler. Purging retains
-- call/usage/accounting metadata but removes conversation content and encrypted callback details.
create or replace function public.purge_expired_call_data() returns integer
language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  perform pg_advisory_xact_lock(hashtext('privacy-retention'));
  delete from public.conversation_turns t using public.conversations c where t.conversation_id=c.id and not public.call_data_unexpired(c.workspace_id,c.started_at);
  delete from public.conversation_tags t using public.conversations c where t.conversation_id=c.id and not public.call_data_unexpired(c.workspace_id,c.started_at);
  delete from public.tool_pending_actions p using public.tool_invocations i where p.invocation_id=i.id and not public.call_artifact_unexpired(i.workspace_id,i.started_at,i.conversation_id,i.session_id);
  update public.conversation_tags set tag=public.redact_call_text(tag) where public.call_redaction_enabled(workspace_id) and exists(select 1 from public.conversations c where c.id=conversation_id and public.call_data_unexpired(c.workspace_id,c.started_at) and c.privacy_purged_at is null);
update public.tool_invocations set input_redacted=null,output_redacted=null where not public.call_artifact_unexpired(workspace_id,started_at,conversation_id,session_id) and (input_redacted is not null or output_redacted is not null);
  update public.workflow_runs set steps='[]'::jsonb,error=null where not public.call_artifact_unexpired(workspace_id,created_at,conversation_id,null) and (steps<>'[]'::jsonb or error is not null);
  update public.conversations set summary=null,caller_number=null,privacy_purged_at=now() where not public.call_data_unexpired(workspace_id,started_at) and privacy_purged_at is null;
  get diagnostics affected=row_count;
  return affected;
end $$;

-- Apply enabled masking to existing retained content, not just future calls.
update public.conversations set summary=public.redact_call_text(summary),caller_number=case when caller_number is null then null else '[REDACTED_NUMBER]' end where public.call_redaction_enabled(workspace_id);
update public.conversation_turns set content=public.redact_call_text(content) where public.call_redaction_enabled(workspace_id) and exists(select 1 from public.conversations c where c.id=conversation_id and public.call_data_unexpired(c.workspace_id,c.started_at));
update public.tool_invocations set input_redacted=public.redact_call_json(input_redacted),output_redacted=public.redact_call_json(output_redacted) where public.call_redaction_enabled(workspace_id);
update public.workflow_runs set steps=public.redact_call_json(steps),error=public.redact_call_text(error) where public.call_redaction_enabled(workspace_id);
select public.purge_expired_call_data();

create or replace function public.apply_call_privacy_policy() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.redact_pii then
    update public.conversations c set summary=public.redact_call_text(summary),caller_number=case when caller_number is null then null else '[REDACTED_NUMBER]' end
      from public.workspaces w where c.workspace_id=w.id and w.org_id=new.org_id;
    update public.conversation_turns t set content=public.redact_call_text(content) from public.workspaces w, public.conversations c
      where t.workspace_id=w.id and w.org_id=new.org_id and c.id=t.conversation_id and public.call_data_unexpired(c.workspace_id,c.started_at) and c.privacy_purged_at is null;
    update public.conversation_tags t set tag=public.redact_call_text(tag) from public.workspaces w, public.conversations c
      where t.workspace_id=w.id and w.org_id=new.org_id and c.id=t.conversation_id and public.call_data_unexpired(c.workspace_id,c.started_at) and c.privacy_purged_at is null;
    update public.tool_invocations i set input_redacted=public.redact_call_json(input_redacted),output_redacted=public.redact_call_json(output_redacted)
      from public.workspaces w where i.workspace_id=w.id and w.org_id=new.org_id;
    update public.workflow_runs r set steps=public.redact_call_json(steps),error=public.redact_call_text(error)
      from public.workspaces w where r.workspace_id=w.id and w.org_id=new.org_id;
  end if;
  perform public.purge_expired_call_data();
  return new;
end $$;
create trigger apply_call_privacy after insert or update on public.security_policies for each row execute function public.apply_call_privacy_policy();

revoke all on function public.call_retention_days(uuid),public.call_redaction_enabled(uuid),public.can_read_call_data(uuid),public.call_data_unexpired(uuid,timestamptz),public.redact_call_text(text),public.redact_call_json(jsonb),public.protect_call_content(),public.protect_call_artifacts(),public.purge_expired_call_data() from public,anon,authenticated;
revoke all on function public.call_artifact_unexpired(uuid,timestamptz,uuid,text),public.apply_call_privacy_policy() from public,anon,authenticated;
revoke all on function public.protect_pending_call_action() from public,anon,authenticated;
grant execute on function public.can_read_call_data(uuid),public.call_data_unexpired(uuid,timestamptz) to authenticated;
grant execute on function public.call_artifact_unexpired(uuid,timestamptz,uuid,text) to authenticated,service_role;
grant execute on function public.call_retention_days(uuid),public.call_redaction_enabled(uuid),public.can_read_call_data(uuid),public.call_data_unexpired(uuid,timestamptz),public.redact_call_text(text),public.redact_call_json(jsonb),public.purge_expired_call_data() to service_role;
