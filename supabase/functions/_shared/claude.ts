// Chamada à API da Anthropic. A chave vive SÓ aqui (secret do Supabase), nunca no navegador.
import { AIError } from "./validate.ts";
import type { Tool } from "./prompts.ts";

export async function askClaude(o: { system: string; user: string; tool: Tool; maxTokens?: number }): Promise<{ input: unknown; model: string }> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new AIError("not_configured");
  const model = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 55_000);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: o.maxTokens ?? 3500,
        system: o.system,
        messages: [{ role: "user", content: o.user }],
        tools: [o.tool],
        tool_choice: { type: "tool", name: o.tool.name }, // força saída estruturada (JSON)
      }),
    });
    if (r.status === 401 || r.status === 403) throw new AIError("auth");
    if (r.status === 429 || r.status === 529 || r.status >= 500) throw new AIError("unavailable");
    if (!r.ok) { console.error("anthropic_status", r.status); throw new AIError("bad_request"); }
    const d = await r.json();
    const block = (d.content ?? []).find((b: { type: string }) => b.type === "tool_use");
    if (!block) throw new AIError("bad_output");
    return { input: block.input, model: d.model ?? model };
  } catch (e) {
    if (e instanceof AIError) throw e;
    if ((e as Error)?.name === "AbortError") throw new AIError("timeout");
    throw new AIError("unavailable");
  } finally {
    clearTimeout(timer);
  }
}
