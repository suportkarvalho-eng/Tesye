(function () {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const A = window.EL_AUTH, cfg = window.ENTRELINHAS_CONFIG || {};
  const landing = $("#landing"), app = $("#app");
  let recovering = false;
  if (!A.ready) $("#cfgWarn").hidden = false;

  function view(n) {
    $$("[data-view]").forEach(v => v.hidden = v.dataset.view !== n);
    $$(".note").forEach(x => { x.textContent = ""; x.className = "note"; });
    const f = $('[data-view="' + n + '"] input'); if (f && matchMedia("(min-width:900px)").matches) f.focus();
  }
  const note = (form, t, ok) => { const n = $(".note", form); n.textContent = t; n.className = "note " + (ok ? "ok" : "err"); };
  $$("[data-go]").forEach(b => b.addEventListener("click", () => view(b.dataset.go)));

  const mailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
  async function run(btn, fn) {
    if (btn.disabled) return;
    const html = btn.innerHTML; btn.disabled = true; btn.textContent = "Aguarde…";
    try { await fn(); } finally { btn.disabled = false; btn.innerHTML = html; }
  }

  $$("[data-form]").forEach(form => form.addEventListener("submit", ev => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(form)), kind = form.dataset.form, btn = $('button[type="submit"]', form);
    if (kind !== "reset" && !mailOk((d.email || "").trim())) return note(form, "Informe um e-mail válido.");
    if (kind === "signup" && (d.name || "").trim().length < 2) return note(form, "Informe seu nome.");
    if (["signup", "reset"].includes(kind)) {
      if ((d.password || "").length < 8) return note(form, "A senha precisa ter ao menos 8 caracteres.");
      if (d.password !== d.confirm) return note(form, "As senhas não conferem.");
    }
    if (kind === "login" && !d.password) return note(form, "Informe sua senha.");
    run(btn, async () => {
      let r;
      if (kind === "login") r = await A.signIn(d.email.trim(), d.password);
      if (kind === "signup") {
        r = await A.signUp(d.name.trim(), d.email.trim(), d.password);
        if (!r.error && r.data && r.data.session) return; // sem confirmação por e-mail: já entra
        if (!r.error) { form.reset(); return note(form, "Conta criada! Enviamos um link de confirmação para o seu e-mail.", true); }
      }
      if (kind === "forgot") { r = await A.reset(d.email.trim()); if (!r.error) return note(form, "Se o e-mail existir, você receberá o link de recuperação.", true); }
      if (kind === "reset") {
        r = await A.newPassword(d.password);
        if (!r.error) { recovering = false; const s = await A.sb.auth.getSession(); if (s.data.session) showApp(s.data.session.user); return; }
      }
      if (r && r.error) note(form, r.error);
    });
  }));

  $$("[data-oauth]").forEach(b => b.addEventListener("click", () => run(b, async () => {
    const r = await A.oauth(b.dataset.oauth);
    if (r.error) { view("login"); note($('[data-view="login"]'), r.error + " (login social precisa estar ativado no Supabase)"); }
  })));

  function showApp(user) {
    const name = (user.user_metadata && user.user_metadata.name) || (user.email || "").split("@")[0];
    $("#hello").textContent = "Olá, " + name + "!";
    $("#pfName").textContent = name; $("#pfMail").textContent = user.email || "";
    landing.hidden = true; app.hidden = false; nav("overview");
  }
  function showLanding() { app.hidden = true; landing.hidden = false; view("home"); }

  function nav(sec) {
    $$("[data-sec]").forEach(s => s.hidden = s.dataset.sec !== sec);
    $$(".side [data-nav]").forEach(b => b.classList.toggle("on", b.dataset.nav === sec));
    document.body.classList.remove("menu-open"); scrollTo(0, 0);
  }
  $$("[data-nav]").forEach(b => b.addEventListener("click", () => nav(b.dataset.nav)));
  $("#menuBtn").addEventListener("click", () => document.body.classList.toggle("menu-open"));
  $("#scrim").addEventListener("click", () => document.body.classList.remove("menu-open"));
  $("#logout").addEventListener("click", () => run($("#logout"), async () => { await A.signOut(); showLanding(); }));

  const texts = {
    privacy: ["Privacidade", "Seus dados ficam na sua conta e são protegidos por regras de acesso por usuário no banco. Texto jurídico definitivo a ser revisado antes do lançamento."],
    terms: ["Termos de Uso", "As análises e simulações são hipóteses de apoio à comunicação, não previsões garantidas do comportamento de ninguém. Texto jurídico definitivo a ser revisado antes do lançamento."],
    support: ["Suporte", cfg.SUPPORT_EMAIL ? "Fale conosco: " + cfg.SUPPORT_EMAIL : "Canal de suporte ainda não configurado. Defina SUPPORT_EMAIL em config.js."]
  };
  $$("[data-info]").forEach(b => b.addEventListener("click", () => {
    const t = texts[b.dataset.info]; $("#infoT").textContent = t[0]; $("#infoP").textContent = t[1]; $("#info").showModal();
  }));
  $("#infoX").addEventListener("click", () => $("#info").close());

  if (A.ready) {
    A.sb.auth.getSession().then(({ data }) => { if (data.session && !recovering) showApp(data.session.user); });
    A.sb.auth.onAuthStateChange((ev, s) => {
      if (ev === "PASSWORD_RECOVERY") { recovering = true; showLanding(); view("reset"); }
      else if (ev === "SIGNED_OUT") showLanding();
      else if (s && !recovering && app.hidden) showApp(s.user);
    });
  }
})();
