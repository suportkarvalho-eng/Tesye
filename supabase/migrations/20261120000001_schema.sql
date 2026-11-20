-- ENTRELINHAS — etapa 2 / migration 1: tabelas, restrições, índices e gatilhos.
-- Limites e valores iniciais dos planos são PONTO DE PARTIDA: ajuste na tabela public.plans.

create table public.plans (
  code text primary key check (code ~ '^[a-z_]+$'),
  name text not null,
  price_cents integer check (price_cents is null or price_cents >= 0),  -- null = a definir
  monthly_analysis_limit integer check (monthly_analysis_limit is null or monthly_analysis_limit >= 0),   -- null = sem limite
  monthly_simulation_limit integer check (monthly_simulation_limit is null or monthly_simulation_limit >= 0),
  max_scripts integer check (max_scripts is null or max_scripts >= 0),
  features jsonb not null default '[]'::jsonb check (jsonb_typeof(features) = 'array'),
  checkout_enabled boolean not null default false,  -- pagamentos DESLIGADOS até existir integração real
  is_active boolean not null default true,
  sort_order integer not null default 0
);

insert into public.plans (code, name, price_cents, monthly_analysis_limit, monthly_simulation_limit, max_scripts, features, sort_order) values
 ('free',    'Gratuito', 0,    10,   5,    30,   '["Estúdio de análise","Simulador de reação","Cofre de scripts","Histórico das análises"]', 1),
 ('premium', 'Premium',  null, null, null, null, '["Tudo do plano Gratuito","Limites ampliados de análises e simulações","Scripts ilimitados","Prioridade em novos recursos"]', 2);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  avatar_path text check (avatar_path is null or char_length(avatar_path) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tone text not null default 'equilibrado' check (tone in ('diplomatico','equilibrado','firme')),
  default_firmness smallint not null default 3 check (default_firmness between 1 and 5),
  default_emotional_balance smallint not null default 3 check (default_emotional_balance between 1 and 5),
  save_history boolean not null default true,
  language text not null default 'pt-BR' check (language in ('pt-BR')),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_code text not null references public.plans (code),
  status text not null default 'active' check (status in ('active','canceled','past_due','expired')),
  provider text,            -- preenchido só pela integração futura de pagamentos
  provider_ref text,
  started_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index subscriptions_one_active_per_user on public.subscriptions (user_id) where status = 'active';
create index subscriptions_user_idx on public.subscriptions (user_id, started_at desc);

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_type text not null check (conversation_type in ('trabalho','relacionamento','familia','amizade','cliente','negociacao','outros')),
  goal text not null check (goal in ('impor_limite','esclarecer','reduzir_tensao','negociar','demonstrar_interesse','encerrar','firmeza')),
  received_message text not null check (char_length(received_message) between 1 and 4000),
  context text check (context is null or char_length(context) <= 2000),
  stance text check (stance is null or char_length(stance) <= 200),
  firmness smallint not null default 3 check (firmness between 1 and 5),
  emotional_balance smallint not null default 3 check (emotional_balance between 1 and 5),
  tension_index smallint check (tension_index is null or tension_index between 0 and 100),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  model text,
  search tsvector generated always as (to_tsvector('portuguese', coalesce(received_message,'') || ' ' || coalesce(context,''))) stored,
  created_at timestamptz not null default now()
);
create index analyses_user_created_idx on public.analyses (user_id, created_at desc);
create index analyses_search_idx on public.analyses using gin (search);

create table public.simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  situation text not null check (char_length(situation) between 1 and 2000),
  planned_reply text not null check (char_length(planned_reply) between 1 and 2000),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  model text,
  created_at timestamptz not null default now()
);
create index simulations_user_created_idx on public.simulations (user_id, created_at desc);

create table public.scripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  content text not null check (char_length(btrim(content)) between 1 and 4000),
  category text not null default 'geral' check (category in ('geral','trabalho','relacionamento','familia','amizade','cliente','negociacao','outros')),
  favorite boolean not null default false,
  source text not null default 'manual' check (source in ('manual','ia')),
  analysis_id uuid references public.analyses (id) on delete set null,
  search tsvector generated always as (to_tsvector('portuguese', coalesce(title,'') || ' ' || coalesce(content,''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index scripts_user_idx on public.scripts (user_id, updated_at desc);
create index scripts_search_idx on public.scripts using gin (search);

-- updated_at automático
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger preferences_updated before update on public.preferences for each row execute function public.set_updated_at();
create trigger scripts_updated before update on public.scripts for each row execute function public.set_updated_at();

-- plano ativo de um usuário (uso interno: triggers e service_role)
create function public._plan_of(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.plan_code from public.subscriptions s
                   where s.user_id = p_user and s.status = 'active' and (s.ends_at is null or s.ends_at > now())
                   limit 1), 'free')
$$;

-- limite de scripts validado NO SERVIDOR (o frontend não decide)
create function public.enforce_script_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare lim integer; cur integer;
begin
  select p.max_scripts into lim from public.plans p where p.code = public._plan_of(new.user_id);
  if lim is not null then
    select count(*) into cur from public.scripts where user_id = new.user_id;
    if cur >= lim then
      raise exception 'script_limit_reached' using errcode = 'P0001', hint = 'Limite de scripts do plano atingido.';
    end if;
  end if;
  return new;
end $$;
create trigger scripts_limit before insert on public.scripts for each row execute function public.enforce_script_limit();

-- ao criar usuário no Supabase Auth: perfil, preferências e assinatura gratuita
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare nm text;
begin
  nm := coalesce(nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', '')), 80), ''),
                 nullif(left(split_part(coalesce(new.email, ''), '@', 1), 80), ''),
                 'Usuário');
  insert into public.profiles (id, name) values (new.id, nm);
  insert into public.preferences (user_id) values (new.id);
  insert into public.subscriptions (user_id, plan_code, status) values (new.id, 'free', 'active');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
