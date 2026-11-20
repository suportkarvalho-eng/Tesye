// Estúdio de análise e Simulador de reação. Todo texto vindo da IA entra via textContent (sem HTML).
(function () {
  const A = window.EL_AUTH, $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const para = t => el("p", null, t || "—");
  const list = items => { const ul = el("ul", "rl"); (items && items.length ? items : ["—"]).forEach(i => ul.append(el("li", null, String(i)))); return ul; };
  const block = (title, node) => { const s = el("section", "blk"); s.append(el("h3", null, title), node); return s; };
  const STYLE = { diplomatica: "Resposta diplomática", equilibrada: "Resposta equilibrada", firme: "Resposta firme e direta" };
  const TYPE = { trabalho: "Trabalho", relacionamento: "Relacionamento", familia: "Família", amizade: "Amizade", cliente: "Cliente", negociacao: "Negociação", outros: "Outros" };
  let busy = false;

  async function copy(text, btn) {
    const old = btn.textContent; let ok = true;
    try { await navigator.clipboard.writeText(text); }
    catch (_) {
      const t = document.createElement("textarea"); t.value = text; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0";
      document.body.append(t); t.select();
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      t.remove();
    }
    btn.textContent = ok ? "Copiado ✓" : "Não foi possível copiar";
    setTimeout(() => { btn.textContent = old; }, 1800);
  }
  async function saveScript(btn, s) {
    if (btn.disabled) return; btn.disabled = true; const old = btn.textContent; btn.textContent = "Salvando…";
    try {
      const { data } = await A.sb.auth.getSession();
      if (!data.session) throw new Error("Sessão expirada. Entre novamente.");
      const { error } = await A.sb.from("scripts").insert({ user_id: data.session.user.id, title: s.title.slice(0, 120), content: s.content, category: s.category, source: "ia", analysis_id: s.analysisId || null });
      if (error) throw new Error(/script_limit_reached/.test(error.message) ? "Limite de scripts do seu plano atingido." : "Não foi possível salvar no cofre.");
      btn.textContent = "Salvo no cofre ✓";
    } catch (e) { btn.textContent = old; btn.disabled = false; alert(e.message); }
  }
  function actions(text, script) {
    const d = el("div", "actions"), c = el("button", null, "Copiar"), s = el("button", null, "Salvar no cofre");
    c.type = s.type = "button";
    c.addEventListener("click", () => copy(text, c)); s.addEventListener("click", () => saveScript(s, script));
    d.append(c, s); return d;
  }
  async function call(fn, body) {
    const { data, error } = await A.sb.functions.invoke(fn, { body });
    if (error) {
      let msg = "Não foi possível concluir. Verifique sua conexão e tente novamente.";
      try { const j = await error.context.json(); if (j && j.error && j.error.message) msg = j.error.message; } catch (_) {}
      throw new Error(msg);
    }
    if (data && data.error) throw new Error(data.error.message);
    return data;
  }
  const note = (form, t, ok) => { const n = $(".note", form); n.textContent = t; n.className = "note " + (ok ? "ok" : "err"); };
  const footer = d => el("p", "fine", `Uso do mês (plano ${d.usage.plan}): ${d.usage.used}${d.usage.limit == null ? "" : "/" + d.usage.limit}` + (d.saved ? "" : " · histórico desativado: esta análise não foi guardada."));

  function wire(form, outId, newId, fn, render) {
    $$("textarea[data-x],textarea", form).forEach(t => { const c = t.parentElement.querySelector(".count"); const up = () => { if (c) c.textContent = t.value.length + "/" + t.maxLength; }; t.addEventListener("input", up); up(); });
    $$("input[type=range]", form).forEach(r => r.addEventListener("input", () => { r.parentElement.querySelector("output").textContent = r.value; }));
    $("#" + newId).addEventListener("click", () => { form.reset(); $(".note", form).textContent = ""; $("#" + outId).replaceChildren(); $$("textarea", form).forEach(t => t.dispatchEvent(new Event("input"))); $$("input[type=range]", form).forEach(r => r.dispatchEvent(new Event("input"))); });
    form.addEventListener("submit", async ev => {
      ev.preventDefault(); if (busy) return;
      const body = Object.fromEntries(new FormData(form)); const btn = $("button[type=submit]", form);
      const required = [...form.querySelectorAll("[required]")].find(f => !f.value.trim());
      if (required) return note(form, "Preencha os campos obrigatórios.");
      if (!A.ready) return note(form, "Supabase não configurado (veja o README).");
      busy = true; btn.disabled = true; const label = btn.textContent; btn.textContent = "Processando…"; note(form, "A IA está trabalhando; isso pode levar alguns segundos.", true);
      try { const d = await call(fn, body); note(form, "", true); render(d, body); $("#" + outId).scrollIntoView({ behavior: "smooth", block: "start" }); }
      catch (e) { note(form, e.message); }
      finally { busy = false; btn.disabled = false; btn.textContent = label; }
    });
  }

  function renderAnalysis(d, body) {
    const r = d.result, out = $("#studioOut"); out.replaceChildren();
    if (r.alerta_seguranca) out.append(el("div", "alert", r.alerta_seguranca));
    const intent = el("ul", "rl"); r.possiveis_intencoes.forEach(i => intent.append(el("li", null, i.hipotese + (i.indicios ? " — indícios: " + i.indicios : ""))));
    out.append(
      block("Diagnóstico da mensagem", para(r.diagnostico)),
      block("Análise das entrelinhas", para(r.entrelinhas)),
      block("Possíveis interpretações", list(r.interpretacoes)),
      block("Sinais de tensão" + (r.indice_tensao == null ? "" : " · índice " + r.indice_tensao + "/100"), list(r.sinais_de_tensao)),
      block("Possíveis intenções (hipóteses)", r.possiveis_intencoes.length ? intent : list([])),
      block("Pontos que merecem atenção", list(r.pontos_de_atencao)),
      block("O que evitar responder", list(r.evitar_responder)),
      block("Explicação estratégica", para(r.explicacao_estrategica)));
    r.respostas.forEach(x => {
      const b = el("section", "blk reply-card"); const label = STYLE[x.estilo] || "Resposta";
      b.append(el("h3", null, label), para(x.texto), el("span", "impact", "Impacto provável: " + (x.impacto_provavel || "—")),
        actions(x.texto, { title: label + " · " + (TYPE[body.conversation_type] || ""), content: x.texto, category: body.conversation_type, analysisId: d.id }));
      out.append(b);
    });
    out.append(el("p", "fine", r.aviso), footer(d));
  }
  function renderSim(d) {
    const r = d.result, out = $("#simOut"); out.replaceChildren();
    if (r.alerta_seguranca) out.append(el("div", "alert", r.alerta_seguranca));
    out.append(el("p", "fine", r.aviso),
      block("Interpretação provável", para(r.interpretacao_provavel)),
      block("Reação positiva possível", para(r.reacao_positiva)),
      block("Reação negativa possível", para(r.reacao_negativa)),
      block("Pontos fortes da resposta", list(r.pontos_fortes)),
      block("Pontos de atenção", list(r.pontos_de_atencao)),
      block("Possíveis consequências", list(r.consequencias)));
    const v = el("section", "blk reply-card"); v.append(el("h3", null, "Versão aprimorada"), para(r.versao_aprimorada),
      actions(r.versao_aprimorada, { title: "Versão aprimorada (simulador)", content: r.versao_aprimorada, category: "outros" }));
    out.append(v, footer(d));
  }
  wire($("#studioForm"), "studioOut", "studioNew", "analyze", renderAnalysis);
  wire($("#simForm"), "simOut", "simNew", "simulate", renderSim);
})();
