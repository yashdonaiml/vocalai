alter table public.knowledge_sources add column if not exists source_url text;

drop function public.match_chunks(uuid[], extensions.vector, integer);

create function public.match_chunks(_kb_ids uuid[], _embedding extensions.vector, _k int default 5)
returns table (id uuid, source_id uuid, content text, similarity float, source_name text)
language sql stable security definer set search_path = public, extensions as $$
  select c.id, c.source_id, c.content, 1 - (c.embedding <=> _embedding) as similarity, s.name as source_name
  from knowledge_chunks c
  join knowledge_sources s on s.id = c.source_id
  where c.knowledge_base_id = any(_kb_ids)
  order by c.embedding <=> _embedding
  limit _k
$$;