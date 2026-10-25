create schema if not exists extensions;
alter extension vector set schema extensions;

revoke execute on function public.has_role(uuid, app_role) from public, anon;
revoke execute on function public.is_org_member(uuid, member_role) from public, anon;
revoke execute on function public.is_workspace_member(uuid, member_role) from public, anon;
grant execute on function public.has_role(uuid, app_role) to authenticated, service_role;
grant execute on function public.is_org_member(uuid, member_role) to authenticated, service_role;
grant execute on function public.is_workspace_member(uuid, member_role) to authenticated, service_role;

create or replace function public.match_chunks(_kb_ids uuid[], _embedding extensions.vector(3072), _k int default 5)
returns table (id uuid, source_id uuid, content text, similarity float)
language sql stable set search_path = public, extensions
as $$
  select c.id, c.source_id, c.content,
         1 - (c.embedding::extensions.halfvec(3072) <=> _embedding::extensions.halfvec(3072)) as similarity
  from public.knowledge_chunks c
  where c.knowledge_base_id = any(_kb_ids)
  order by c.embedding::extensions.halfvec(3072) <=> _embedding::extensions.halfvec(3072)
  limit least(greatest(_k, 1), 20)
$$;