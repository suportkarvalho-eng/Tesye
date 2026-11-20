import { makeHandler } from "../_shared/pipeline.ts";
import { parseAnalyze } from "../_shared/validate.ts";
import { analyzePrompt, cleanAnalysis } from "../_shared/prompts.ts";

Deno.serve(makeHandler({
  kind: "analysis",
  table: "analyses",
  parse: parseAnalyze,
  prompt: analyzePrompt,
  clean: cleanAnalysis,
  row: (i, save, r) => ({
    conversation_type: i.conversation_type,
    goal: i.goal,
    received_message: save ? i.received_message : "(histórico desativado)",
    context: save ? i.context : null,
    stance: save ? i.stance : null,
    firmness: i.firmness,
    emotional_balance: i.emotional_balance,
    tension_index: r.indice_tensao,
  }),
}));
