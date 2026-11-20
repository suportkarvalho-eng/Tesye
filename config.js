// Configuração PÚBLICA do frontend. A chave "anon" do Supabase é pública por design
// (a proteção dos dados vem do RLS). NUNCA coloque aqui a service_role nem chaves de IA.
window.ENTRELINHAS_CONFIG = {
  SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
  SUPABASE_ANON_KEY: "SUA_CHAVE_ANON_PUBLICA",
  SUPPORT_EMAIL: "" // e-mail de suporte exibido no rodapé
};
