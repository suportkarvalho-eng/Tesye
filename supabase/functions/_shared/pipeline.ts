// Pipeline comum de analyze/simulate: autenticação -> validação -> limites -> IA -> gravação.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { AIError, ValidationError } from "./validate.ts";
import { askClaude } from "./claude.ts";
import type { Tool } from "./prompts.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (status: number, code: string, message: string) => reply(status, { error: { code, message } });

const AI_ERRORS: Record<string, [number, string]> = {
  not_configured: [503, "A IA ainda não foi configurada no servidor (falta a chave ANTHROPIC_API_KEY)."],
  auth: [502, "O servidor não conseguiu autenticar no serviço de IA. Verifique a chave configurada."],
  unavailable: [503, "O serviço de IA está indisponível ou sobrecarregado. Tente novamente em instantes."],
  timeout: [504, "A IA demorou demais para responder. Tente novamente."],
  bad_output: [502, "A IA devolveu uma resposta fora do formato. Tente novamente."],
  bad_request: [502, "Não foi possível processar este pedido na IA. Tente novamente."],
};

export function makeHandler<T>(cfg: {
  kind: "analysis" | "simulation";
  table: "analyses" | "simulations";
  parse: (body: unknown) => T;
  prompt: (i: T) => { system: string; user: string; tool: Tool };
  clean: (raw: unknown) => Record<string, any>;
  row: (i: T, save: boolean, result: Record<string, any>) => Record<string, unknown>;
}) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return fail(405, "method_not_allowed", "Use POST.");
    try {
      const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      if (!token) return fail(401, "unauthorized", "Faça login para continuar.");
      const { data: u, error: ue } = await admin.auth.getUser(token);
      if (ue || !u?.user) return fail(401, "unauthorized", "Sessão inválida ou expirada. Entre novamente.");
      const uid = u.user.id;

      const raw = await req.text();
      if (raw.length > 20_000) return fail(413, "too_large", "Conteúdo grande demais.");
      let body: unknown;
      try { body = JSON.parse(raw); } catch { return fail(400, "bad_json", "Requisição inválida."); }
      const input = cfg.parse(body); // lança ValidationError

      // controle de requisições: no máximo 3 a cada 30 s por usuário
      const since = new Date(Date.now() - 30_000).toISOString();
      const { count, error: e1 } = await admin.from(cfg.table).select("id", { count: "exact", head: true }).eq("user_id", uid).gte("created_at", since);
      if (e1) throw e1;
      if ((count ?? 0) >= 3) return fail(429, "too_many_requests", "Muitas solicitações em sequência. Aguarde alguns segundos.");

      // cota mensal do plano (decidida no banco)
      const { data: q, error: e2 } = await admin.rpc("check_quota", { p_user: uid, p_kind: cfg.kind });
      if (e2) throw e2;
      if (!q.allowed) return fail(429, "quota_exceeded", `Você atingiu o limite do plano neste mês (${q.used}/${q.limit}).`);

      const { data: pref } = await admin.from("preferences").select("save_history").eq("user_id", uid).maybeSingle();
      const save = pref?.save_history !== false;

      const { system, user, tool } = cfg.prompt(input);
      const ai = await askClaude({ system, user, tool });
      const result = cfg.clean(ai.input);

      const { data: ins, error: e3 } = await admin.from(cfg.table)
        .insert({ ...cfg.row(input, save, result), user_id: uid, result: save ? result : { omitido: true }, model: ai.model })
        .select("id").single();
      if (e3) throw e3;
      return reply(200, { id: save ? ins.id : null, saved: save, result, usage: { used: q.used + 1, limit: q.limit, plan: q.plan } });
    } catch (e) {
      if (e instanceof ValidationError) return fail(400, "invalid_input", e.message);
      if (e instanceof AIError) {
        console.error("ai_error", e.code);
        const [status, msg] = AI_ERRORS[e.code] ?? AI_ERRORS.unavailable;
        return fail(status, "ai_" + e.code, msg);
      }
      console.error("internal_error", (e as Error)?.message);
      return fail(500, "internal_error", "Erro interno. Tente novamente em instantes.");
    }
  };
}
