// Validação de entrada NO SERVIDOR (nunca confiar no navegador) + erros tipados.
export class ValidationError extends Error {}
export class AIError extends Error {
  code: string;
  constructor(code: string) { super(code); this.code = code; }
}

export const TYPES = ["trabalho", "relacionamento", "familia", "amizade", "cliente", "negociacao", "outros"] as const;
export const GOALS = ["impor_limite", "esclarecer", "reduzir_tensao", "negociar", "demonstrar_interesse", "encerrar", "firmeza"] as const;

function text(v: unknown, label: string, min: number, max: number): string {
  if (typeof v !== "string") throw new ValidationError(`${label}: texto obrigatório.`);
  const s = v.replace(/\u0000/g, "").trim();
  if (s.length < min) throw new ValidationError(`${label}: preencha este campo.`);
  if (s.length > max) throw new ValidationError(`${label}: máximo de ${max} caracteres.`);
  return s;
}
function optText(v: unknown, label: string, max: number): string | null {
  if (v === null || v === undefined || v === "") return null;
  return text(v, label, 0, max) || null;
}
function oneOf<T extends readonly string[]>(v: unknown, list: T, label: string): T[number] {
  if (typeof v !== "string" || !(list as readonly string[]).includes(v)) throw new ValidationError(`${label}: valor inválido.`);
  return v as T[number];
}
function int(v: unknown, min: number, max: number, label: string, def: number): number {
  if (v === null || v === undefined || v === "") return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new ValidationError(`${label}: use um valor entre ${min} e ${max}.`);
  return n;
}
function obj(b: unknown): Record<string, unknown> {
  if (!b || typeof b !== "object" || Array.isArray(b)) throw new ValidationError("Corpo da requisição inválido.");
  return b as Record<string, unknown>;
}

export function parseAnalyze(body: unknown) {
  const b = obj(body);
  return {
    conversation_type: oneOf(b.conversation_type, TYPES, "Tipo de conversa"),
    goal: oneOf(b.goal, GOALS, "Objetivo"),
    received_message: text(b.received_message, "Mensagem recebida", 1, 4000),
    context: optText(b.context, "Contexto adicional", 2000),
    stance: optText(b.stance, "Postura desejada", 200),
    firmness: int(b.firmness, 1, 5, "Nível de firmeza", 3),
    emotional_balance: int(b.emotional_balance, 1, 5, "Equilíbrio emocional", 3),
  };
}
export type AnalyzeInput = ReturnType<typeof parseAnalyze>;

export function parseSimulate(body: unknown) {
  const b = obj(body);
  return {
    situation: text(b.situation, "Situação", 1, 2000),
    planned_reply: text(b.planned_reply, "Resposta pretendida", 1, 2000),
  };
}
export type SimulateInput = ReturnType<typeof parseSimulate>;
