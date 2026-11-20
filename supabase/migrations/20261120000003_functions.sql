-- ENTRELINHAS — etapa 2 / migration 3: funções de apoio (painel, gráficos, cotas).

-- Uso do mês + limites do plano ATIVO (decidido no banco, não no navegador)
create function public.my_usage()
returns table (plan_code text, plan_name text, period_start timestamptz,
               analyses_used integer, analyses_limit integer,
               simulations_used integer, simulations_limit integer,
               scripts_used integer, scripts_limit integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  ps timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
begin
  if uid is null then return; end if;
  return query
    select p.code, p.name, ps,
           (select count(*)::integer from public.analyses a where a.user_id = uid and a.created_at >= ps),
           p.monthly_analysis_limit,
           (select count(*)::integer from public.simulations s where s.user_id = uid and s.created_at >= ps),
           p.monthly_simulation_limit,
           (select count(*)::integer from public.scripts c where c.user_id = uid),
           p.max_scripts
    from public.plans p
    where p.code = public._plan_of(uid);
end $$;

-- Resumo do painel. SECURITY INVOKER: o RLS filtra automaticamente só os dados de quem chama.
create function public.dashboard_stats() returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'total_analyses',    (select count(*) from public.analyses),
    'avg_tension',       (select round(avg(tension_index)::numeric, 1) from public.analyses where tension_index is not null),
    'scripts_count',     (select count(*) from public.scripts),
    'favorites_count',   (select count(*) from public.scripts where favorite),
    'simulations_count', (select count(*) from public.simulations),
    'recent', coalesce((select jsonb_agg(r) from (
        select id, conversation_type, goal, tension_index, created_at, left(received_message, 100) as preview
        from public.analyses order by created_at desc limit 5) r), '[]'::jsonb)
  )
$$;

-- Série diária para os gráficos de utilização (também por RLS)
create function public.usage_by_day(p_days integer default 30)
returns table (day date, analyses integer, simulations integer)
language sql stable set search_path = '' as $$
  with d as (
    select g::date as day
    from generate_series((now() at time zone 'utc')::date - (least(greatest(p_days, 1), 365) - 1),
                         (now() at time zone 'utc')::date, interval '1 day') g
  )
  select d.day,
         (select count(*)::integer from public.analyses a    where (a.created_at at time zone 'utc')::date = d.day),
         (select count(*)::integer from public.simulations s where (s.created_at at time zone 'utc')::date = d.day)
  from d order by d.day
$$;

-- Verificação de cota para as Edge Functions (só service_role): p_kind = 'analysis' | 'simulation'
create function public.check_quota(p_user uuid, p_kind text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  ps timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  lim integer; used integer; plan text := public._plan_of(p_user);
begin
  if p_kind = 'analysis' then
    select monthly_analysis_limit into lim from public.plans where code = plan;
    select count(*) into used from public.analyses where user_id = p_user and created_at >= ps;
  elsif p_kind = 'simulation' then
    select monthly_simulation_limit into lim from public.plans where code = plan;
    select count(*) into used from public.simulations where user_id = p_user and created_at >= ps;
  else
    raise exception 'invalid_kind';
  end if;
  return jsonb_build_object('allowed', lim is null or used < lim, 'used', used, 'limit', lim, 'plan', plan);
end $$;

revoke all on function public.my_usage(), public.dashboard_stats(), public.usage_by_day(integer), public.check_quota(uuid, text) from public, anon, authenticated;
grant execute on function public.my_usage(), public.dashboard_stats(), public.usage_by_day(integer) to authenticated;
grant execute on function public.check_quota(uuid, text) to service_role;
