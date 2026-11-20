# ENTRELINHAS — Coach de Conversas e Respostas

**Etapas 1 a 3 de 5.** Etapa 1: tela inicial (fiel à imagem de referência), cadastro, login, recuperação de senha, sessão, logout e o painel com as 7 seções (menu lateral no PC, menu em gaveta no celular).
Etapa 3: Estúdio de análise e Simulador de reação funcionando com IA (Claude). Cofre, Histórico, Planos e Perfil ainda são **páginas vazias** que avisam em qual etapa chegam. Nada nelas finge funcionar.

## 1. Configurar o Supabase
1. Crie um projeto em https://supabase.com.
2. **Project Settings → API:** copie a *Project URL* e a chave **anon public**.
3. Abra `config.js` e cole os dois valores. (Nunca use a `service_role` aqui.)
4. **Authentication → URL Configuration:** em *Site URL* e *Redirect URLs* coloque o endereço do GitHub Pages
   (ex.: `https://SEU-USUARIO.github.io/entrelinhas/`). Sem isso, os links de confirmação e de recuperação de senha não voltam para o app.
5. **Authentication → Providers → Email:** deixe *Confirm email* ativado (verificação de e-mail).
6. Login social (Google, GitHub, Microsoft/Azure): só funciona depois de ativar e configurar cada provedor em *Authentication → Providers*. Sem isso, os botões mostram uma mensagem de erro clara.

## 2. Banco de dados (etapa 2)
Crie as tabelas **antes** do primeiro cadastro (um gatilho cria perfil, preferências e plano gratuito para cada novo usuário).

**Opção A — SQL Editor (mais simples):** no painel do Supabase, abra *SQL Editor* e execute, **nesta ordem**, o conteúdo de:
1. `supabase/migrations/20261120000001_schema.sql`
2. `supabase/migrations/20261120000002_rls.sql`
3. `supabase/migrations/20261120000003_functions.sql`

**Opção B — CLI:** `supabase link --project-ref SEU_REF` e depois `supabase db push`.

**Teste de segurança:** rode `supabase/tests/rls_isolation.sql` no SQL Editor. Ele cria dois usuários de mentira, tenta acessar dados cruzados e termina em ROLLBACK (não grava nada). Esperado: avisos `OK ...` e nenhum `FALHOU`.

O que foi criado:
- Tabelas: `profiles`, `preferences`, `plans`, `subscriptions`, `analyses`, `simulations`, `scripts`, todas com RLS ligado.
- O navegador só lê e mexe nos **próprios** dados. Análises, simulações e assinaturas só são gravadas pelo backend (Edge Functions, etapa 3). O plano premium não pode ser ativado pelo navegador.
- Limites (checados no banco): plano gratuito = 10 análises/mês, 5 simulações/mês, 30 scripts. **São valores iniciais inventados por mim: ajuste na tabela `plans`.** O preço do Premium está em branco (a definir) e `checkout_enabled = false`: nenhum pagamento existe.
- Bucket privado `avatars` (até 2 MB, jpeg/png/webp), com cada pessoa restrita à própria pasta.
- Funções para o painel: `dashboard_stats()`, `usage_by_day(dias)`, `my_usage()`.

## 3. IA com Claude (etapa 3)
A chave da IA fica **só no Supabase**, nunca no site. Cada análise/simulação consome crédito da SUA conta na Anthropic.
1. Gere uma chave em https://console.anthropic.com (e coloque crédito na conta).
2. Instale a CLI do Supabase, faça `supabase link --project-ref SEU_REF` e rode:
   ```
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase secrets set ALLOWED_ORIGIN=https://SEU-USUARIO.github.io
   supabase functions deploy analyze --no-verify-jwt
   supabase functions deploy simulate --no-verify-jwt
   ```
   (`--no-verify-jwt`: as funções validam o login do usuário por conta própria.)
3. Opcional: `supabase secrets set ANTHROPIC_MODEL=...` para trocar o modelo. O padrão é `claude-sonnet-5-5`; **confirme que esse nome existe na sua conta**. Se der erro de modelo, defina outro.
4. Se a chave não estiver configurada, o app avisa isso na tela (não existe IA falsa).

O servidor faz, em cada chamada: confere o login → valida tamanhos e opções → limita a 3 chamadas a cada 30 s → confere a cota mensal do plano → chama a IA exigindo JSON estruturado → limpa a resposta → grava o histórico. Se a preferência `save_history` estiver desligada, o conteúdo não é guardado (só um registro vazio, para contar a cota).
Observação: duas chamadas simultâneas podem passar juntas pela cota (corrida rara); o gasto extra fica limitado pelo limite de 3 a cada 30 s.

## 4. Publicar no GitHub Pages
1. Crie um repositório e envie **todo o conteúdo desta pasta** (o `index.html` fica na raiz).
2. **Settings → Pages → Deploy from a branch →** `main` / `/ (root)` → Save.
3. Aguarde 1–2 minutos e abra o endereço indicado.

## Imagens (pasta assets/)
- `Referencia.entrelinhas.png`: imagem de referência original, usada na pré-visualização de compartilhamento (og:image).
- `retrato.jpg`, `logo.png`, `logo-card.png`: recortes da referência usados na tela inicial.
Se trocar o arquivo de referência, refaça os recortes mantendo os mesmos nomes.

## Testes desta etapa
Feitos (navegador automatizado, sem Supabase configurado):
- Tela inicial abre sem erros de JavaScript; todas as imagens carregam.
- Sem rolagem horizontal em 1440×860 (PC) e 390×844 (celular).
- Navegação Entrar/Cadastrar, validação dos campos e mensagem clara quando o Supabase não está configurado.

**IA (etapa 3), feito aqui:** `node --experimental-strip-types supabase/tests/functions_logic.test.mjs` (validação de entrada, proteção contra injeção de tag no prompt, limpeza da saída da IA). Interface do Estúdio e do Simulador testada em navegador automatizado (PC e celular) com um Supabase **simulado**: envio dos campos, duplo clique = 1 chamada, mensagem de cota, copiar, salvar no cofre, texto da IA exibido sem interpretar HTML, sem rolagem horizontal.
**IA (etapa 3), NÃO feito:** as Edge Functions nunca rodaram no Deno nem falaram com a API real do Claude (sem Deno e sem internet no meu ambiente). O primeiro teste real é seu: faça o deploy e use o Estúdio. Se der erro, me mande a mensagem exibida.

**Banco de dados (etapa 2): os SQLs NÃO foram executados por mim.** Não havia PostgreSQL no meu ambiente; só conferi a sintaxe de forma estática (aspas, parênteses, RLS em todas as tabelas). A execução real e o teste de isolamento acima ficam por sua conta; se algo falhar, me envie a mensagem de erro.

**Ainda NÃO testados** (dependem do seu projeto Supabase): cadastro real, e-mail de confirmação, login, recuperação de senha, persistência de sessão, logout e login social.

## Próximas etapas
2. ✅ Banco de dados (escrito, aguardando sua execução) · 3. ✅ IA e telas do Estúdio/Simulador (escritas, aguardando teste real) · 4. Cofre, Histórico, Planos, Perfil (+ função `profile`: exportar dados, excluir conta) · 5. Revisão final e README completo.
