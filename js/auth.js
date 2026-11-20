// Camada de autenticação (Supabase Auth). Nenhuma senha é guardada pelo app.
(function () {
  const cfg = window.ENTRELINHAS_CONFIG || {};
  const ready = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !/SEU-PROJETO|SUA_CHAVE/.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY) && window.supabase);
  const sb = ready ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;
  const back = location.origin + location.pathname;

  function tr(e) {
    const m = (e && e.message || "").toLowerCase();
    if (m.includes("invalid login")) return "E-mail ou senha incorretos.";
    if (m.includes("not confirmed")) return "Confirme seu e-mail antes de entrar (veja sua caixa de entrada).";
    if (m.includes("already registered")) return "Este e-mail já possui cadastro.";
    if (m.includes("password") && m.includes("least")) return "A senha é curta demais.";
    if (m.includes("rate limit") || m.includes("too many")) return "Muitas tentativas. Aguarde um pouco e tente de novo.";
    if (m.includes("failed to fetch") || m.includes("network")) return "Sem conexão com o servidor. Verifique sua internet.";
    return "Não foi possível concluir. Tente novamente.";
  }
  const wrap = async (fn) => { if (!sb) return { error: "Supabase não configurado (veja o README)." }; try { const r = await fn(); return r.error ? { error: tr(r.error) } : r; } catch (e) { return { error: tr(e) }; } };

  window.EL_AUTH = {
    ready, sb,
    signIn: (email, password) => wrap(() => sb.auth.signInWithPassword({ email, password })),
    signUp: (name, email, password) => wrap(() => sb.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: back } })),
    reset: (email) => wrap(() => sb.auth.resetPasswordForEmail(email, { redirectTo: back })),
    newPassword: (password) => wrap(() => sb.auth.updateUser({ password })),
    oauth: (provider) => wrap(() => sb.auth.signInWithOAuth({ provider, options: { redirectTo: back } })),
    signOut: () => wrap(() => sb.auth.signOut())
  };
})();
