-- ENTRELINHAS — teste de isolamento (RLS). Rode no SQL Editor do Supabase DEPOIS das migrations.
-- Tudo roda dentro de uma transação que termina em ROLLBACK: nada fica gravado.
-- Sucesso = termina sem erro e mostra os avisos "OK ...". Qualquer falha lança "FALHOU ...".
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@teste.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'b@teste.local');

-- o backend (service/postgres) grava a análise da pessoa A
insert into public.analyses (user_id, conversation_type, goal, received_message, result, tension_index)
values ('00000000-0000-0000-0000-0000000000a1', 'trabalho', 'esclarecer', 'Mensagem privada de A', '{}'::jsonb, 40);

-- ===== Pessoa A =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

insert into public.scripts (user_id, title, content) values (auth.uid(), 'Script de A', 'Conteúdo de A');

do $$
begin
  if (select count(*) from public.analyses) <> 1 then raise exception 'FALHOU: A deveria ver 1 análise'; end if;
  if (select count(*) from public.scripts)  <> 1 then raise exception 'FALHOU: A deveria ver 1 script'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'FALHOU: A deveria ver só o próprio perfil'; end if;
  if (public.dashboard_stats() ->> 'total_analyses')::int <> 1 then raise exception 'FALHOU: dashboard_stats de A'; end if;
  raise notice 'OK A enxerga apenas os próprios dados';
end $$;

-- ===== Pessoa B =====
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);

do $$
declare n integer;
begin
  if (select count(*) from public.analyses) <> 0 then raise exception 'FALHOU: B vê análise de A'; end if;
  if (select count(*) from public.scripts)  <> 0 then raise exception 'FALHOU: B vê script de A'; end if;
  if (select count(*) from public.profiles where id <> auth.uid()) <> 0 then raise exception 'FALHOU: B vê perfil de A'; end if;
  if (select count(*) from public.subscriptions where user_id <> auth.uid()) <> 0 then raise exception 'FALHOU: B vê assinatura de A'; end if;

  update public.scripts set title = 'invadido' where user_id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: B editou script de A'; end if;

  delete from public.scripts where user_id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: B apagou script de A'; end if;

  delete from public.analyses where user_id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: B apagou análise de A'; end if;

  update public.profiles set name = 'invadido' where id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: B editou perfil de A'; end if;
  raise notice 'OK B não lê, edita nem apaga dados de A';

  begin
    insert into public.scripts (user_id, title, content) values ('00000000-0000-0000-0000-0000000000a1', 'x', 'y');
    raise exception 'FALHOU: B inseriu script em nome de A';
  exception when insufficient_privilege then null; end;

  begin
    insert into public.analyses (user_id, conversation_type, goal, received_message, result)
    values (auth.uid(), 'trabalho', 'esclarecer', 'falsa', '{}'::jsonb);
    raise exception 'FALHOU: cliente conseguiu inserir análise direto';
  exception when insufficient_privilege then null; end;

  begin
    update public.subscriptions set plan_code = 'premium';
    raise exception 'FALHOU: cliente conseguiu alterar o próprio plano';
  exception when insufficient_privilege then null; end;

  begin
    perform public.check_quota(auth.uid(), 'analysis');
    raise exception 'FALHOU: cliente executou check_quota';
  exception when insufficient_privilege then null; end;
  raise notice 'OK operações proibidas foram bloqueadas (inserir em nome de outro, análises, plano, cota)';
end $$;

-- validação no servidor: título vazio é rejeitado
do $$
begin
  begin
    insert into public.scripts (user_id, title, content) values (auth.uid(), '   ', 'conteúdo');
    raise exception 'FALHOU: aceitou título vazio';
  exception when check_violation then null; end;
  raise notice 'OK restrições de conteúdo funcionam';
end $$;

-- limite de scripts do plano gratuito (30) validado no banco
do $$
begin
  for i in 1..30 loop
    insert into public.scripts (user_id, title, content) values (auth.uid(), 'S' || i, 'c');
  end loop;
  begin
    insert into public.scripts (user_id, title, content) values (auth.uid(), 'S31', 'c');
    raise exception 'FALHOU: passou do limite de scripts';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'script_limit_reached' then raise; end if;
  end;
  raise notice 'OK limite de scripts aplicado pelo servidor';
end $$;

rollback;
