import { makeHandler } from "../_shared/pipeline.ts";
import { parseSimulate } from "../_shared/validate.ts";
import { simulatePrompt, cleanSimulation } from "../_shared/prompts.ts";

Deno.serve(makeHandler({
  kind: "simulation",
  table: "simulations",
  parse: parseSimulate,
  prompt: simulatePrompt,
  clean: cleanSimulation,
  row: (i, save) => ({
    situation: save ? i.situation : "(histórico desativado)",
    planned_reply: save ? i.planned_reply : "(histórico desativado)",
  }),
}));
