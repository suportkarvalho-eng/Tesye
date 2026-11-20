-- ENTRELINHAS — etapa 2 / migration 2: RLS, permissões e Storage.
-- Princípio: o navegador (role "authenticated") só enxerga/altera o que é DELE.
-- Análises, simulações e assinaturas são gravadas apenas pelo backend (service_role / Edge Functions).

alter table public.plans         enable row level security;
alter table public.profiles      enable row level security;
alter table public.preferences   enable row level security;
alter table public.subscriptions enable row level security;
alter table public.analyses      enable row level security;
alter table public.simulations   enable row level security;
alter table public.scripts       enable row level security;

-- zera permissões herdadas e concede só o necessário
revoke all on public.plans, public.profiles, public.preferences, public.subscriptions,
              public.analyses, public.simulations, public.scripts from anon, authenticated;

grant select on public.plans to anon, authenticated;
grant select on public.profiles, public.subscriptions to authenticated;
grant update (name, avatar_path) on public.profiles to authenticated;
grant select on public.preferences to authenticated;
grant update (tone, default_firmness, default_emotional_balance, save_history, language) on public.preferences to authenticated;
grant select, delete on public.analyses, public.simulations to authenticated;
grant select, delete on public.scripts to authenticated;
grant insert (user_id, title, content, category, favorite, source, analysis_id) on public.scripts to authenticated;
grant update (title, content, category, favorite) on public.scripts to authenticated;

create policy plans_read on public.plans for select to anon, authenticated using (is_active);

create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy preferences_select on public.preferences for select to authenticated using (user_id = (select auth.uid()));
create policy preferences_update on public.preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy subscriptions_select on public.subscriptions for select to authenticated using (user_id = (select auth.uid()));

create policy analyses_select on public.analyses for select to authenticated using (user_id = (select auth.uid()));
create policy analyses_delete on public.analyses for delete to authenticated using (user_id = (select auth.uid()));

create policy simulations_select on public.simulations for select to authenticated using (user_id = (select auth.uid()));
create policy simulations_delete on public.simulations for delete to authenticated using (user_id = (select auth.uid()));

create policy scripts_select on public.scripts for select to authenticated using (user_id = (select auth.uid()));
create policy scripts_insert on public.scripts for insert to authenticated with check (
  user_id = (select auth.uid())
  and (analysis_id is null or exists (select 1 from public.analyses a where a.id = analysis_id and a.user_id = (select auth.uid()))));
create policy scripts_update on public.scripts for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy scripts_delete on public.scripts for delete to authenticated using (user_id = (select auth.uid()));

-- funções internas: nunca expostas ao navegador
revoke all on function public._plan_of(uuid), public.enforce_script_limit(), public.handle_new_user(), public.set_updated_at() from public, anon, authenticated;

-- Storage: bucket PRIVADO de avatares; cada usuário só mexe na própria pasta (<user_id>/arquivo)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create policy avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
