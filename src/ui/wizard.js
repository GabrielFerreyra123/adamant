// ADAMANT · Wizard (F6). Schema-driven: la pantalla 1 es una grilla de módulos constructivos
// (desde el registro del motor) y los pasos siguientes se autogeneran desde el `schema` del módulo.
// Agregar un tipo nuevo NO toca este archivo si usa sólo campos simples (sistema/medida/seg/cards/perfil).
import { computeProject, cutPlan, cutOpts, listModules, getModule } from "../engine/index.mjs";
import { murosDelAmbiente } from "../engine/modules/combinado.mjs";
import { Viewer } from "../viewer/viewer.js";
import { TIPO_LABEL, colorHex } from "../viewer/palette.js";
import { getPrice, setPrice, money, loadPrices } from "./prices.js";
import { getLicencia, diasRestantes, iniciarPago, generar, canjearSiVuelve, nuevoProyecto, getProyId } from "./licencia.js";

const VANO_DEFAULTS = {
  puerta:  { ancho:800,  alto:2050, sill:0   },
  ventana: { ancho:1200, alto:1100, sill:900 },
  arcada:  { ancho:1500, alto:2100, sill:0   } // paso libre; hasta 2,50 m, dintel reforzado si >1,50
};
const VANO_LABEL = { puerta:"Puerta", ventana:"Ventana", arcada:"Arcada" };
const VANO_INI = { puerta:"P", ventana:"V", arcada:"A" };
const VANO_COL = { puerta:"var(--tangerine)", ventana:"#e8b53a", arcada:"#27b0c9" };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

const state = { kind: null, step: 0, params: null, adv: false, tab: "3d", vista3d: null, parte3d: "todo", capas: {}, muroSel: null };
// Capas de revestimiento conmutables (superficies): id de capa → etiqueta y tipo (para color de leyenda).
const CAPA_INFO = {
  "placa-piso":  { l: "Placa de piso",          tipo: "PLACA" },
  "rev-ext":     { l: "Rev. exterior muros",     tipo: "REV.EXT" },
  "rev-int":     { l: "Rev. interior muros",     tipo: "REV.INT" },
  "placa-cielo": { l: "Placa de cielorraso",     tipo: "PLACA" }
};
const CAPA_ORDEN = ["placa-piso", "rev-ext", "rev-int", "placa-cielo"];
function capasDe(piezas){
  const ids = new Set(piezas.filter(p => p.capa).map(p => p.capa));
  return CAPA_ORDEN.filter(id => ids.has(id)).map(id => ({ id, ...CAPA_INFO[id] }));
}
let root, viewer = null;

// El proyecto en curso vive sólo en memoria (state); al ir a pagar, la vuelta desde Mercado Pago
// recarga la página y lo borraría. Lo persistimos en localStorage y lo reponemos al cargar, así al
// volver del checkout (o tras cualquier recarga) el proyecto sigue cargado. Se limpia SÓLO al
// empezar un proyecto nuevo (borrarProyectoGuardado), para no arrastrar lo anterior.
const WKEY = "adamant_wizard";
const KINDS = new Set(listModules().map(m => m.id));
function guardarProyecto(){
  if (!state.kind) return;
  try {
    const { kind, step, params, adv, tab, vista3d, parte3d, capas, muroSel } = state;
    localStorage.setItem(WKEY, JSON.stringify({ kind, step, params, adv, tab, vista3d, parte3d, capas, muroSel }));
  } catch {}
}
function restaurarProyecto(){
  try {
    const st = JSON.parse(localStorage.getItem(WKEY));
    if (st && KINDS.has(st.kind) && st.params) Object.assign(state, st);
  } catch {}
}
export function borrarProyectoGuardado(){ try { localStorage.removeItem(WKEY); } catch {} }

const pasosOf = () => getModule(state.kind).schema.pasos;
const getVal = c => c.opt ? state.params.opciones[c.k] : state.params[c.k];
function parseNum(s){ s = String(s).trim(); if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); const n = parseFloat(s.replace(/[^\d.]/g, "")); return isFinite(n) ? n : 0; }
function findCampo(paso, k){ return [...(paso.campos||[]), ...(paso.avanzado||[])].find(c => c.k === k); }
function errCampo(c){ if (!c || c.tipo !== "medida" || !c.rango) return null; const v = getVal(c); return (v < c.rango[0] || v > c.rango[1]) ? `Entre ${c.rango[0]/1000} y ${c.rango[1]/1000} m` : null; }
function pasoValido(paso){ return [...(paso.campos||[]), ...(paso.avanzado||[])].every(c => c.tipo !== "medida" || !errCampo(c)); }

// Vanos del wizard {tipo,ancho,alto,sill,pos} → formato del motor {tipo,x1,x2,h,sill}.
const mapVanos = arr => (arr || []).map(v => ({ tipo:v.tipo, x1:Math.round(v.pos - v.ancho/2), x2:Math.round(v.pos + v.ancho/2), h:v.sill + v.alto, sill:v.sill }));
// Genérico: pasa todos los params tal cual; transforma vanos al formato del motor. El combinado lleva
// un array de vanos por muro (vanoFrente/Fondo/Izq/Der).
function toEngineInput(){
  const p = state.params;
  if (state.kind === "combinado")
    return { ...p, kind: "combinado", opciones: { ...p.opciones },
      vanoFrente: mapVanos(p.vanoFrente), vanoFondo: mapVanos(p.vanoFondo), vanoIzq: mapVanos(p.vanoIzq), vanoDer: mapVanos(p.vanoDer) };
  return { ...p, kind: state.kind, vanos: mapVanos(p.vanos), opciones: { ...p.opciones } };
}

// ============ shell ============
export function startWizard(el){
  root = el;
  root.innerHTML =
    `<header class="topbar">
       <div class="tb-brand"><b>ADAMANT</b><span>Autoconstrucción en seco</span></div>
       <nav class="tb-nav" id="tbnav">
         <a data-phase="0">Elegir</a><a data-phase="1">Medidas</a><a data-phase="2">Plano</a><a data-phase="3">Exportar</a>
       </nav>
       <a class="tb-cta" href="/">Empezar gratis</a>
     </header>
     <div class="progress" id="progress"></div>
     <section class="content" id="content"></section>
     <nav class="wnav" id="wnav"></nav>`;
  restaurarProyecto(); // si volvemos del pago (o recarga), recuperar el proyecto en curso
  render();
  // Si venimos del checkout de Mercado Pago, canjear el pago por la licencia y refrescar la UI.
  // El canje puede adoptar el proyecto pagado como activo, así que restauramos otra vez por si el
  // id se había desincronizado (recién ahí coinciden proyecto y licencia).
  canjearSiVuelve().then(activada => { if (activada){ restaurarProyecto(); render(); } });
}

function render(){
  guardarProyecto();
  const nPasos = state.kind ? pasosOf().length : 0;
  const enResultado = state.kind && state.step === nPasos + 1;
  if (viewer && !enResultado){ viewer.dispose(); viewer = null; }
  renderProgress();
  const c = document.getElementById("content");
  c.classList.toggle("noscroll", enResultado);
  if (state.step === 0){ c.innerHTML = stepGrid(); wireGrid(); }
  else if (enResultado){ c.innerHTML = stepResultado(); wireResultado(); }
  else { const paso = pasosOf()[state.step - 1]; c.innerHTML = stepPaso(paso); wirePaso(paso); }
  renderNav();
}

function renderProgress(){
  const labels = state.kind ? ["Tipo", ...pasosOf().map(p => p.titulo), "Resultado"] : ["Tipo"];
  document.getElementById("progress").innerHTML = labels.map((s, i) =>
    `<div class="pstep ${i===state.step?'on':''} ${i<state.step?'done':''}"><i>${i+1}</i><span>${s}</span></div>`).join("");
  // Fase activa en la barra superior (Elegir / Medidas / Plano / Exportar).
  const nav = document.getElementById("tbnav");
  if (nav){
    const nPasos = state.kind ? pasosOf().length : 0;
    const enResultado = state.kind && state.step === nPasos + 1;
    const compo = state.step >= 1 && state.step <= nPasos ? pasosOf()[state.step - 1].componente : null;
    const fase = state.step === 0 ? 0 : enResultado ? 3 : (compo === "vanos" || compo === "murosPlanta") ? 2 : 1;
    nav.querySelectorAll("a").forEach(a => a.classList.toggle("on", +a.dataset.phase === fase));
  }
}

function renderNav(){
  const nPasos = state.kind ? pasosOf().length : 0;
  const enResultado = state.kind && state.step === nPasos + 1;
  const enPaso = state.step >= 1 && state.step <= nPasos;
  const blocked = enPaso && !pasoValido(pasosOf()[state.step - 1]);
  const prev = state.step > 0 ? `<button class="btn ghost" id="prev">← Atrás</button>` : `<span></span>`;
  let right = `<span></span>`;
  if (enPaso) right = `<button class="btn" id="next" ${blocked?"disabled":""}>${state.step===nPasos?"Ver resultado":"Siguiente"} →</button>`;
  else if (enResultado) right = `<button class="btn ghost" id="edit">Editar</button>`;
  const total = nPasos + 1, frac = total ? Math.min(1, state.step / total) : 0;
  const mid = `<div class="wprog"><span>Progreso del proyecto</span><div class="segbar" style="--p:${Math.round(frac*100)}%"></div></div>`;
  document.getElementById("wnav").innerHTML = prev + mid + right;
  const p = document.getElementById("prev"); if (p) p.onclick = () => { state.step--; state.muroSel = null; render(); };
  const n = document.getElementById("next"); if (n) n.onclick = () => { state.step++; state.muroSel = null; render(); };
  const e = document.getElementById("edit"); if (e) e.onclick = () => { state.step = 1; state.muroSel = null; render(); };
}

// ---------- paso 0: grilla de módulos ----------
// Ícono de línea de cada card (solo visual, estilo design-ref). Aditivo: el SVG reemplaza al emoji
// sólo en esta grilla; el m.icono del registro no se toca.
const svg = p => `<svg class="modicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const MOD_ICON = {
  muro:  svg('<rect x="4" y="3" width="4" height="18" rx="1"/><rect x="10" y="3" width="4" height="18" rx="1"/><rect x="16" y="3" width="4" height="18" rx="1"/>'),
  piso:  svg('<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>'),
  cielo: svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
  combinado: svg('<path d="M3 10 12 3l9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/>')
};
function stepGrid(){
  return `<header class="gridhead"><h2>¿Qué vas a construir?</h2>
    <p class="sub">Elegí el módulo estructural para iniciar el cálculo de materiales y planos de montaje.</p></header>
    <div class="modgrid">${listModules().map(m => `<button class="modcard ${state.kind===m.id?'on':''}" data-id="${m.id}">
      <span class="modtop">${MOD_ICON[m.id] || `<span class="modicon">${m.icono}</span>`}</span>
      <b>${m.nombre}</b><span class="moddesc">${m.descripcion}</span></button>`).join("")}</div>`;
}
function wireGrid(){
  document.querySelectorAll(".modcard").forEach(b => b.onclick = () => {
    if (state.kind !== b.dataset.id){ state.kind = b.dataset.id; state.params = structuredClone(getModule(state.kind).defaults()); state.vista3d = null; state.parte3d = "todo"; state.capas = {}; state.muroSel = null; }
    state.step = 1; render();
  });
}

// ---------- pasos autogenerados ----------
function stepPaso(paso){
  let html = `<h2>${paso.titulo}</h2>`;
  if (paso.componente === "vanos") return html + vanosHTML();
  if (paso.componente === "murosPlanta") return html + murosPlantaHTML();
  html += (paso.campos || []).map(campoHTML).join("");
  if (paso.avanzado){
    html += `<button class="adv-toggle" id="advt">${state.adv?"▾":"▸"} Opciones avanzadas</button>
      <div class="adv ${state.adv?'':'hide'}">${paso.avanzado.map(campoHTML).join("")}</div>`;
  }
  return html;
}
function segHTML(key, val, opciones){
  return `<div class="seg" data-seg="${key}">${opciones.map(o => `<button data-v="${o.v}" class="${String(val)===String(o.v)?'on':''}">${o.l}</button>`).join("")}</div>`;
}
function perfilHTML(){
  const p = state.params.opciones, wood = state.params.sistema === "wood";
  const opt = (arr, sel) => arr.map(o => `<option ${o===sel?'selected':''}>${o}</option>`).join("");
  return wood
    ? `<label class="lbl">Escuadría</label><select data-opt="lumber">${opt(["2x4 (38×89)","2x6 (38×140)","2x8 (38×184)","2x10 (38×235)"], p.lumber)}</select>`
    : `<label class="lbl">Perfil montante / viga (PGC)</label><select data-opt="pgc">${opt(["PGC 90x0.90","PGC 100x0.90","PGC 140x0.90","PGC 150x1.60","PGC 200x1.60"], p.pgc)}</select>
       <label class="lbl">Perfil solera / cenefa (PGU)</label><select data-opt="pgu">${opt(["PGU 90x0.90","PGU 100x0.90","PGU 140x0.90","PGU 150x1.60","PGU 200x1.60"], p.pgu)}</select>`;
}
function campoHTML(c){
  const v = getVal(c);
  if (c.tipo === "sistema") return `<label class="lbl">Sistema</label>${segHTML("sistema", state.params.sistema, [{v:"steel",l:"Steel frame"},{v:"wood",l:"Wood frame"}])}`;
  if (c.tipo === "cards")   return `<label class="lbl">${c.label}</label><div class="cards" data-cards="${c.k}">${c.opciones.map(o => `<button class="card ${v===o.v?'on':''}" data-v="${o.v}"><b>${o.titulo}</b><span>${o.desc}</span></button>`).join("")}</div>`;
  if (c.tipo === "medida"){ const err = errCampo(c); return `<label class="lbl">${c.label}</label><div class="field ${err?'bad':''}"><input type="text" inputmode="decimal" autocomplete="off" data-medida="${c.k}" value="${(v||0)/1000}"><span class="unit">m</span>${err?`<small>${err}</small>`:""}</div>`; }
  if (c.tipo === "seg")     return `<label class="lbl">${c.label}</label>${segHTML((c.opt?"opt:":"") + c.k, v, c.opciones)}`;
  if (c.tipo === "perfil")  return perfilHTML();
  return "";
}
function wirePaso(paso){
  if (paso.componente === "vanos"){ wireVanos(); return; }
  if (paso.componente === "murosPlanta"){ wireMurosPlanta(); return; }
  document.querySelectorAll("[data-seg]").forEach(seg => seg.querySelectorAll("button").forEach(b => b.onclick = () => {
    const key = seg.dataset.seg, raw = b.dataset.v;
    const val = raw === "true" ? true : raw === "false" ? false : (isNaN(+raw) ? raw : +raw);
    if (key === "sistema"){ state.params.sistema = raw; render(); return; }
    const opt = key.startsWith("opt:"), k = opt ? key.slice(4) : key;
    if (opt) state.params.opciones[k] = val; else state.params[k] = val;
    render();
  }));
  document.querySelectorAll("[data-cards]").forEach(cs => cs.querySelectorAll(".card").forEach(b => b.onclick = () => {
    const k = cs.dataset.cards, campo = findCampo(paso, k);
    state.params[k] = b.dataset.v;
    if (campo && campo.onSet) campo.onSet(state.params, b.dataset.v);
    render();
  }));
  document.querySelectorAll("[data-medida]").forEach(inp => inp.oninput = () => {
    const k = inp.dataset.medida; state.params[k] = Math.round(parseNum(inp.value) * 1000);
    renderNav(); inp.parentElement.classList.toggle("bad", !!errCampo(findCampo(paso, k)));
  });
  document.querySelectorAll("select[data-opt]").forEach(sel => sel.onchange = () => { state.params.opciones[sel.dataset.opt] = sel.value; });
  const advt = document.getElementById("advt"); if (advt) advt.onclick = () => { state.adv = !state.adv; render(); };
}

// ---------- componente custom: aberturas (vista frontal) ----------
// Contexto de edición: el muro (single) usa params.vanos/largo/alto; el combinado, el array del muro
// seleccionado (vanoFrente/Fondo/Izq/Der) y el largo real de ese muro.
function vanoCtx(){
  if (state.kind === "combinado" && state.muroSel){
    const key = "vano" + cap(state.muroSel);
    state.params[key] = state.params[key] || [];
    const m = murosDelAmbiente(state.params).find(x => x.parte === state.muroSel);
    return { arr: state.params[key], largo: m.largo, alto: +state.params.alto };
  }
  state.params.vanos = state.params.vanos || [];
  return { arr: state.params.vanos, largo: +state.params.largo, alto: +state.params.alto };
}
// Clampea la posición de un vano dentro del muro y sin solaparse con los otros.
function clampPos(v, arr, largo){
  let lo = v.ancho/2, hi = largo - v.ancho/2;
  arr.forEach(o => { if (o === v) return;
    if (v.pos <= o.pos) hi = Math.min(hi, o.pos - o.ancho/2 - v.ancho/2);
    else lo = Math.max(lo, o.pos + o.ancho/2 + v.ancho/2);
  });
  return Math.round(Math.max(lo, Math.min(hi, v.pos)));
}
function vanosHTML(){
  return `<p class="sub">Agregá puertas, ventanas o arcadas y arrastralas sobre el muro para ubicarlas.</p>
    <div class="schem" id="schem"></div>
    <div class="addrow"><button class="btn sm" id="addP">＋ Puerta</button><button class="btn sm" id="addV">＋ Ventana</button><button class="btn sm" id="addA">＋ Arcada</button></div>
    <div id="vlist"></div>`;
}
function wireVanos(){
  drawSchem();
  document.getElementById("addP").onclick = () => addVano("puerta");
  document.getElementById("addV").onclick = () => addVano("ventana");
  document.getElementById("addA").onclick = () => addVano("arcada");
  renderVanoList();
}
function addVano(tipo){
  const { arr, largo } = vanoCtx();
  const d = { ...VANO_DEFAULTS[tipo] };
  if (d.ancho > largo - 100) d.ancho = Math.max(400, largo - 100); // que entre en el muro
  const v = { tipo, ...d, pos: Math.round(largo / 2) };
  v.pos = clampPos(v, arr, largo);
  arr.push(v); render();
}
function drawSchem(){
  const box = document.getElementById("schem"); if (!box) return;
  const { arr, largo: L, alto: A } = vanoCtx();
  const W = box.clientWidth || 340, pad = 10, H = Math.max(120, Math.min(260, (W - 2*pad) * (A/L) + 2*pad));
  const iw = W - 2*pad, ih = H - 2*pad, XS = x => pad + x/L * iw, ZT = z => pad + ih - z/A * ih;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect x="${pad}" y="${pad}" width="${iw}" height="${ih}" fill="#0c1e25" stroke="var(--teal)" stroke-width="2"/>`;
  arr.forEach((v, i) => {
    const x1 = XS(v.pos - v.ancho/2), x2 = XS(v.pos + v.ancho/2), yt = ZT(v.sill + v.alto), yb = ZT(v.sill);
    const col = VANO_COL[v.tipo];
    s += `<g class="vrect" data-i="${i}"><rect x="${x1.toFixed(1)}" y="${yt.toFixed(1)}" width="${(x2-x1).toFixed(1)}" height="${(yb-yt).toFixed(1)}" fill="${col}" fill-opacity="0.35" stroke="${col}" stroke-width="2" rx="2"/>
      <text x="${((x1+x2)/2).toFixed(1)}" y="${((yt+yb)/2+4).toFixed(1)}" text-anchor="middle" font-size="11" fill="#fff">${VANO_INI[v.tipo]}${i+1}</text></g>`;
  });
  s += `</svg>`; box.innerHTML = s; box._geo = { pad, iw };
  box.querySelectorAll(".vrect").forEach(g => g.addEventListener("pointerdown", startVanoDrag));
}
function startVanoDrag(e){
  e.preventDefault();
  const i = +e.currentTarget.dataset.i, box = document.getElementById("schem"), { pad, iw } = box._geo;
  const { arr, largo: L } = vanoCtx();
  const rect = box.querySelector("svg").getBoundingClientRect(), v = arr[i];
  const move = ev => {
    v.pos = Math.round(((ev.clientX - rect.left - pad) / iw * L) / 50) * 50;
    v.pos = clampPos(v, arr, L); drawSchem(); renderVanoList();
  };
  const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
}
function renderVanoList(){
  const el = document.getElementById("vlist"); if (!el) return;
  const { arr, largo: L, alto: A } = vanoCtx();
  if (!arr.length){ el.innerHTML = `<p class="sub">Sin aberturas (muro lleno).</p>`; return; }
  el.innerHTML = arr.map((v, i) => {
    const sinSill = v.tipo !== "ventana";
    const warn = (v.ancho > 2500 ? "Ancho máx 2,50 m. " : "") + (v.sill + v.alto > A ? "No entra en alto. " : "");
    return `<div class="vcard">
      <div class="vhead"><b>${VANO_LABEL[v.tipo]} ${i+1}${v.ancho > 1500 ? " · dintel doble" : ""}</b><button class="x" data-del="${i}">✕</button></div>
      <div class="vgrid">
        <label>Ancho<input type="number" data-k="ancho" data-i="${i}" value="${v.ancho}"><i>mm</i></label>
        <label>Alto<input type="number" data-k="alto" data-i="${i}" value="${v.alto}"><i>mm</i></label>
        <label>Antepecho<input type="number" data-k="sill" data-i="${i}" value="${v.sill}" ${sinSill?'disabled':''}><i>mm</i></label>
        <label>Posición<input type="number" data-k="pos" data-i="${i}" value="${v.pos}"><i>mm</i></label>
      </div>${warn?`<small class="vwarn">⚠ ${warn}</small>`:""}</div>`;
  }).join("");
  el.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { arr.splice(+b.dataset.del, 1); render(); });
  el.querySelectorAll("input[data-k]").forEach(inp => inp.oninput = () => {
    const v = arr[+inp.dataset.i], k = inp.dataset.k, val = Math.round(parseFloat(inp.value) || 0);
    if (k === "ancho") v.ancho = Math.max(300, Math.min(2500, Math.min(val, L - 100)));       // entra en el muro, máx 2,50
    else if (k === "alto") v.alto = Math.max(300, Math.min(val, A - v.sill));                  // no supera el alto del muro
    else if (k === "sill") v.sill = Math.max(0, Math.min(val, A - v.alto));
    else v.pos = val;
    v.pos = clampPos(v, arr, L); drawSchem();
  });
}

// ---------- combinado: aberturas por muro (esquema en planta) ----------
function murosPlantaHTML(){
  if (state.muroSel){
    const m = murosDelAmbiente(state.params).find(x => x.parte === state.muroSel);
    return `<div class="muroedit"><button class="btn ghost sm" id="volverPlanta">← Planta</button>
      <b>${m.l} · ${(m.largo/1000).toFixed(2)} m</b></div>${vanosHTML()}`;
  }
  return `<p class="sub">Tocá un muro para agregarle puertas, ventanas o arcadas.</p><div class="planta4" id="planta4"></div>`;
}
function wireMurosPlanta(){
  if (state.muroSel){
    document.getElementById("volverPlanta").onclick = () => { state.muroSel = null; render(); };
    wireVanos(); return;
  }
  drawPlanta4();
}
function nVanosMuro(parte){ return (state.params["vano" + cap(parte)] || []).length; }
function drawPlanta4(){
  const box = document.getElementById("planta4"); if (!box) return;
  const muros = murosDelAmbiente(state.params), largo = +state.params.largo, ancho = +state.params.ancho;
  const W = box.clientWidth || 340, H = Math.max(180, Math.min(300, W * ancho/largo)), t = 26;
  const g = (parte, x, y, w, h, tx, ty) => `<g class="wtap" data-parte="${parte}">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/>
      <text x="${tx}" y="${ty}" text-anchor="middle">${muros.find(m=>m.parte===parte).l}${nVanosMuro(parte)?` (${nVanosMuro(parte)})`:""}</text></g>`;
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="plantasvg">
    <rect x="${t}" y="${t}" width="${W-2*t}" height="${H-2*t}" class="room"/>
    ${g("fondo",  t, 0,     W-2*t, t, W/2, t-8)}
    ${g("frente", t, H-t,   W-2*t, t, W/2, H-8)}
    ${g("izq",    0, t,     t, H-2*t, 12, H/2)}
    ${g("der",    W-t, t,   t, H-2*t, W-12, H/2)}
    <text x="${W/2}" y="${H/2}" text-anchor="middle" class="plantahint">planta</text></svg>`;
  box.querySelectorAll(".wtap").forEach(w => w.onclick = () => { state.muroSel = w.dataset.parte; render(); });
}

// ---------- paso resultado (común a todos los módulos) ----------
function stepResultado(){
  const tabs = [["3d","3D"],["mat","Materiales"],["cut","Cortes"],["pdf","PDF"]];
  return `<div class="result"><div class="tabs">${tabs.map(([k,l]) => `<button class="tab ${state.tab===k?'on':''}" data-tab="${k}">${l}</button>`).join("")}</div><div class="tabbody" id="tabbody"></div></div>`;
}
function wireResultado(){ document.querySelectorAll(".tabs .tab").forEach(b => b.onclick = () => { state.tab = b.dataset.tab; renderTab(); }); renderTab(); }
function renderTab(){
  document.querySelectorAll(".tabs .tab").forEach(b => b.classList.toggle("on", b.dataset.tab === state.tab));
  const body = document.getElementById("tabbody");
  if (viewer){ viewer.dispose(); viewer = null; }
  if (state.tab === "3d"){
    const { piezas, metadatos } = computeProject(toEngineInput());
    const vistas = vistasDe(metadatos);
    if (!state.vista3d || !vistas.some(v => v.id === state.vista3d)) state.vista3d = metadatos.vistaDefault || vistas[0].id;
    const selector = vistas.length > 1
      ? `<div class="viewsel" id="viewsel">${vistas.map(v => `<button data-v="${v.id}" class="${state.vista3d===v.id?'on':''}">${v.l}</button>`).join("")}</div>` : "";
    // "ver por partes" (módulo combinado): Todo + cada parte (piso / muros)
    const partes = metadatos.partes || null;
    if (partes && !["todo", ...partes.map(p => p.id)].includes(state.parte3d)) state.parte3d = "todo";
    const partesel = partes
      ? `<div class="partesel" id="partesel">${[{ id: "todo", l: "Todo" }, ...partes].map(p => `<button data-p="${p.id}" class="${state.parte3d===p.id?'on':''}">${p.l}</button>`).join("")}</div>` : "";
    // panel de CAPAS de revestimiento (superficies conmutables): checkboxes independientes, arrancan apagadas
    const capas = capasDe(piezas);
    const capasPanel = capas.length
      ? `<div class="capas" id="capaspanel"><b>Capas</b>${capas.map(c => `<label><input type="checkbox" data-capa="${c.id}" ${state.capas[c.id]?'checked':''}><i style="background:${colorHex(c.tipo)}"></i>${c.l}</label>`).join("")}</div>` : "";
    body.innerHTML = `<div class="viewer ${partes?'hasparts':''}" id="viewer3d">${selector}${partesel}${capasPanel}<div class="legend" id="legend3d"></div><div class="info hidden" id="info3d"></div>
      <p class="hint">Girá con un dedo · pellizcá zoom · dos dedos desplazar · tocá una pieza</p></div>`;
    try {
      viewer = new Viewer(document.getElementById("viewer3d"), { onSelect: showInfo3d });
      const mostrar = () => (partes && state.parte3d !== "todo") ? piezas.filter(p => p.parte === state.parte3d) : piezas;
      const aplicarCapas = () => capas.forEach(c => { if (state.capas[c.id]) viewer.setLayerVisible(c.id, true); });
      viewer.setPieces(mostrar(), { vista: state.vista3d, elevacion: metadatos.elevacion || 0 }); aplicarCapas();
      document.getElementById("legend3d").innerHTML = [...new Set(piezas.map(p => p.tipo))].map(t => `<span class="chip"><i style="background:${colorHex(t)}"></i>${TIPO_LABEL[t]||t}</span>`).join("");
      const vs = document.getElementById("viewsel");
      if (vs) vs.querySelectorAll("button").forEach(b => b.onclick = () => {
        state.vista3d = b.dataset.v; vs.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); viewer.setView(state.vista3d);
      });
      const ps = document.getElementById("partesel");
      if (ps) ps.querySelectorAll("button").forEach(b => b.onclick = () => {
        state.parte3d = b.dataset.p; ps.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
        viewer.setPieces(mostrar(), { vista: state.vista3d, elevacion: metadatos.elevacion || 0 }); aplicarCapas();
      });
      const cp = document.getElementById("capaspanel");
      if (cp) cp.querySelectorAll("input[data-capa]").forEach(chk => chk.onchange = () => {
        state.capas[chk.dataset.capa] = chk.checked; viewer.setLayerVisible(chk.dataset.capa, chk.checked);
      });
    } catch (e) {
      // Sin WebGL / aceleración por hardware: no romper la app, avisar y dejar el resto funcionando.
      if (viewer){ try { viewer.dispose(); } catch {} viewer = null; }
      console.warn("Visor 3D no disponible (WebGL):", e && e.message);
      body.innerHTML = `<div class="nowebgl">
        <b>No se pudo iniciar el visor 3D</b>
        <p>Tu navegador no tiene <b>WebGL / aceleración por hardware</b> activada. El resto de la app
        (Materiales, Cortes y PDF) funciona igual — el PDF incluye el esquema acotado.</p>
        <p class="how">Para ver el 3D: activá <i>Aceleración por hardware</i> en la configuración del navegador
        y reinicialo, o probá en otra ventana/navegador. Verificá en <code>chrome://gpu</code>.</p>
        <button class="btn ghost sm" id="retry3d">Reintentar</button></div>`;
      const r = document.getElementById("retry3d"); if (r) r.onclick = () => renderTab();
    }
  } else if (state.tab === "mat"){ renderMateriales(body); }
  else if (state.tab === "cut"){ renderCortes(body); }
  else { renderExport(body); }
}
// Vistas disponibles del módulo (desde metadatos); fallback según el esquema (frontal/planta).
function vistasDe(metadatos){
  if (metadatos.vistas && metadatos.vistas.length) return metadatos.vistas;
  return metadatos.esquema === "planta" ? [{ id: "planta", l: "Planta" }] : [{ id: "frontal", l: "Frente" }];
}
function showInfo3d(p){
  const el = document.getElementById("info3d"); if (!el) return;
  if (!p){ el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  el.innerHTML = `<b style="color:${colorHex(p.tipo)}">${TIPO_LABEL[p.tipo]||p.tipo}</b><div class="row">${p.perfil}</div><div class="row">Largo <b>${p.largo} mm</b> · eje <b>${p.axis.toUpperCase()}</b></div>`;
}

// ---------- materiales ----------
// Unidad de venta con el largo comercial REAL del perfil (6,00 m barra / 3,05 · 3,00 · 4,88 m tira).
const unidadBarra = len => `${len >= 6000 ? "barra" : "tira"} ${(len/1000).toFixed(2).replace(".", ",")} m`;
// Advertencias del proyecto (hoy: arriostramiento). Muro y Ambiente las publican en metadatos.avisos.
function avisosHTML(metadatos){
  const av = metadatos?.avisos || [];
  return av.length ? `<div class="avisos"><b>⚠ Arriostramiento</b>${av.map(a => `<span>${a}</span>`).join("")}</div>` : "";
}
function shoppingList(mat){
  const items = [];
  mat.perfiles.forEach(p => items.push({ key:`perf:${p.perfil}`, label:p.perfil, unidad:unidadBarra(p.largoBarra), cant:p.barras }));
  (mat.placas || []).forEach(p => items.push({ key:`placa:${p.material}`, label:`Placa ${p.material} · ${p.cara}`, unidad:"placa 1,20×2,40", cant:p.unidades }));
  if (mat.aislacion > 0) items.push({ key:"aislacion", label:"Aislación (lana)", unidad:"m²", cant:Math.ceil(mat.aislacion) });
  if (mat.tornillos?.t1) items.push({ key:"t1", label:"Tornillo T1 (estructura)", unidad:"u", cant:mat.tornillos.t1 });
  if (mat.tornillos?.t2) items.push({ key:"t2", label:"Tornillo T2 (placa)", unidad:"u", cant:mat.tornillos.t2 });
  (mat.otros || []).forEach(o => items.push({ key:o.key, label:o.label, unidad:o.unidad, cant:o.cantidad })); // ítems propios del módulo (placa de piso, implantación…)
  return items;
}
function renderMateriales(body){
  const { materiales, metadatos } = computeProject(toEngineInput());
  const items = shoppingList(materiales);
  const rows = items.map(it => {
    const sku = it.key.replace(/[^a-z0-9]+/gi, "-");
    return `<tr><td>${it.label}</td><td class="u">${it.unidad}</td><td class="n">${it.cant}</td>
      <td class="n"><input class="pinput" type="text" inputmode="decimal" autocomplete="off" name="precio-unitario-${sku}" id="precio-unitario-${sku}" aria-label="Precio ${it.label}" data-key="${it.key}" data-cant="${it.cant}" value="${getPrice(it.key) || ""}" placeholder="0"></td>
      <td class="n" data-sub>${money(it.cant * getPrice(it.key))}</td></tr>`;
  }).join("");
  body.innerHTML = `<form class="pane" autocomplete="off" onsubmit="return false">
    ${avisosHTML(metadatos)}
    <table class="mtable"><thead><tr><th>Material</th><th>Unidad</th><th class="n">Cant</th><th class="n">$ unit.</th><th class="n">Subtotal</th></tr></thead>
    <tbody>${rows}</tbody><tfoot><tr><td colspan="4" class="n"><b>TOTAL</b></td><td class="n"><b data-total></b></td></tr></tfoot></table>
    <p class="sub">Perfiles/maderas en barras comerciales (6 m steel · 3,05 m wood); placas 1,20×2,40. Cargá el precio de tu corralón — se guarda en este navegador. Sólo materiales.</p>
  </form>`;
  const recompute = () => {
    let total = 0;
    body.querySelectorAll(".pinput").forEach(inp => { const st = (+inp.dataset.cant) * parseNum(inp.value); total += st; inp.closest("tr").querySelector("[data-sub]").textContent = money(st); });
    body.querySelector("[data-total]").textContent = money(total);
  };
  body.querySelectorAll(".pinput").forEach(inp => inp.addEventListener("input", () => { setPrice(inp.dataset.key, parseNum(inp.value)); recompute(); }));
  recompute();
}

// ---------- cortes ----------
function renderCortes(body){
  const { piezas } = computeProject(toEngineInput());
  const plan = cutPlan(piezas, cutOpts(toEngineInput())); // largo de barra por perfil
  const secciones = plan.map(pl => {
    // FLEJES: vienen en rollo, no salen de una barra → se listan los largos, sin barras ni sobra.
    if (pl.fleje) return `<div class="cutgrp"><div class="cuthead"><b>${pl.perfil}</b>
      <span>${pl.metros} m · ${pl.rollos} rollo${pl.rollos!==1?"s":""} de ${pl.largoRollo/1000} m</span></div>
      <div class="bin"><span class="binno">Rollo</span><span class="binitems">${pl.items.map(it =>
        `<i title="${TIPO_LABEL[it.tipo]||it.tipo}">${it.code}·${it.largo}</i>`).join("")}</span>
      <span class="binrem">${pl.piezas} pieza${pl.piezas!==1?"s":""}</span></div></div>`;
    const unidad = unidadBarra(pl.barLen), esTira = unidad.split(" ")[0] === "tira";
    const bins = pl.bins.map((b, i) => `<div class="bin"><span class="binno">${esTira?"Tira":"Barra"} ${i+1}</span>
      <span class="binitems">${b.items.map(it => `<i title="${TIPO_LABEL[it.tipo]||it.tipo}">${it.code}·${it.largo}</i>`).join("")}</span>
      <span class="binrem">sobra ${b.rem} mm</span></div>`).join("");
    const alerta = pl.over ? `<div class="warn">${pl.over} pieza(s) más largas que la barra — requieren empalme.</div>` : "";
    return `<div class="cutgrp"><div class="cuthead"><b>${pl.perfil}</b><span>${pl.bins.length} ${unidad}${pl.bins.length!==1?"s":""} · desperdicio ${pl.waste}%</span></div>${bins}${alerta}</div>`;
  }).join("");
  const gate = !getLicencia();
  body.innerHTML = `<div class="pane ${gate ? "gated" : ""}">${avisosHTML(computeProject(toEngineInput()).metadatos)}${secciones || `<p class="sub">Sin piezas.</p>`}
    <p class="sub">Cada etiqueta es <b>código·largo(mm)</b>. Optimización First-Fit, sin descontar merma de sierra.</p>
    ${gate ? `<div class="gateoverlay"><p>La lista de cortes optimizada viene con el proyecto desbloqueado.</p><button class="btn" id="gate-pagar">Desbloquear proyecto</button></div>` : ""}</div>`;
  if (gate) document.getElementById("gate-pagar").onclick = () => { guardarProyecto(); iniciarPago().catch(e => alert(e.message)); };
}

// ---------- export ----------
// Snapshot del 3D para el PDF (el WebGL solo existe en el navegador; el backend recibe la imagen).
function capture3D(piezas, metadatos = {}){
  const div = document.createElement("div");
  div.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;height:560px;";
  document.body.appendChild(div);
  let url = null;
  const vista = (metadatos.vistas && metadatos.vistas[0] && (metadatos.vistaDefault || metadatos.vistas[0].id))
    || (metadatos.esquema === "planta" ? "planta" : "frontal");
  try { const v = new Viewer(div, { snapshot: true }); v.setPieces(piezas, { vista, elevacion: metadatos.elevacion || 0 }); v.resize(); url = v.toDataURL(); v.dispose(); }
  catch (e) { console.warn("snapshot 3D falló", e); }
  div.remove();
  return url;
}

function renderExport(body){
  if (!getLicencia()){
    body.innerHTML = `<div class="pane center">
      <p class="sub"><b>Desbloqueá este proyecto</b> y llevate el PDF completo (resumen, 3D, esquema acotado,
      lista de compra con tus precios y lista de cortes optimizada) + el export a SketchUp.
      Ediciones libres por 30 días — rehacé el PDF las veces que quieras.</p>
      <button class="btn" id="pagar">Desbloquear con Mercado Pago</button>
      <p class="expnote">Pago único <b>por proyecto</b>: desbloquea el que estás armando y lo podés seguir
      editando 30 días. Empezar otro proyecto requiere un pago nuevo. La licencia queda en este navegador.</p>
      <p class="expmsg" id="expmsg"></p></div>`;
    const msg = document.getElementById("expmsg");
    document.getElementById("pagar").onclick = () => {
      msg.textContent = "Abriendo Mercado Pago…";
      guardarProyecto(); // asegurar el proyecto en storage antes de irnos al checkout
      iniciarPago().catch(e => { msg.textContent = "Error: " + e.message; });
    };
    return;
  }
  body.innerHTML = `<div class="pane center">
    <p class="sub">Proyecto desbloqueado ✓ (quedan ${diasRestantes()} días). Descargá el PDF completo (resumen, 3D, esquema acotado, compra y cortes).</p>
    <button class="btn" id="dlpdf">🧾 Descargar PDF</button>
    <div class="expsep">Llevar a SketchUp</div>
    <button class="btn" id="cprb">📋 Copiar script Ruby</button>
    <button class="btn ghost" id="dlrb">⬇ Descargar .rb</button>
    <p class="expnote">Pegá el script en <b>Ventana → Consola de Ruby</b> de SketchUp y Enter. Si descargás el .rb, cargalo con <code>load "C:/ruta/al/archivo.rb"</code>.</p>
    <div class="expsep">Otro proyecto</div>
    <button class="btn ghost" id="nuevoproy">✚ Empezar un proyecto nuevo</button>
    <p class="expnote">El desbloqueo vale para <b>este</b> proyecto. Empezar uno nuevo requiere otro pago.</p>
    <p class="expmsg" id="expmsg"></p></div>`;
  const msg = document.getElementById("expmsg");
  const fallo = e => { msg.textContent = "Error: " + (e.message || e); console.error(e); };
  document.getElementById("nuevoproy").onclick = () => {
    if (!confirm("Vas a empezar un proyecto nuevo, que hay que desbloquear con otro pago.\n\nEl proyecto actual queda cerrado: si querés volver a bajar su PDF, hacelo ahora.\n\n¿Seguir?")) return;
    nuevoProyecto();
    borrarProyectoGuardado();
    state.kind = null; state.step = 0; state.params = null;
    state.vista3d = null; state.parte3d = "todo"; state.capas = {}; state.muroSel = null; state.tab = "3d";
    render();
  };
  document.getElementById("dlpdf").onclick = async () => {
    msg.textContent = "Generando PDF…";
    try {
      const input = toEngineInput();
      const { piezas, metadatos } = computeProject(input);
      const img = capture3D(piezas.filter(p => !p.superficie), metadatos);
      const blob = await generar("pdf", input, { img, precios: loadPrices() });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `adamant-${state.kind}-${state.params.sistema}.pdf`; a.click(); URL.revokeObjectURL(a.href);
      msg.textContent = "✓ PDF descargado";
    } catch (e) { fallo(e); }
  };
  document.getElementById("cprb").onclick = async () => {
    msg.textContent = "Generando script…";
    try {
      const rb = await generar("ruby", toEngineInput());
      const okMsg = "✓ Copiado — pegalo en la consola Ruby de SketchUp (Ventana → Consola de Ruby)";
      try { await navigator.clipboard.writeText(rb); msg.textContent = okMsg; }
      catch {
        const ta = document.createElement("textarea"); ta.value = rb; ta.style.cssText = "position:fixed;left:-9999px;top:0";
        document.body.appendChild(ta); ta.focus(); ta.select();
        try { document.execCommand("copy"); msg.textContent = okMsg; } catch { msg.textContent = "No se pudo copiar; usá Descargar .rb"; }
        ta.remove();
      }
    } catch (e) { fallo(e); }
  };
  document.getElementById("dlrb").onclick = async () => {
    msg.textContent = "Generando script…";
    try {
      const rb = await generar("ruby", toEngineInput());
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rb], { type: "text/plain" }));
      a.download = `adamant-${state.kind}-${state.params.sistema}.rb`; a.click(); URL.revokeObjectURL(a.href);
      msg.textContent = "✓ .rb descargado — cargalo con load \"ruta/al/archivo.rb\" o pegá su contenido";
    } catch (e) { fallo(e); }
  };
}
