// ADAMANT · Wizard (F6). Schema-driven: la pantalla 1 es una grilla de módulos constructivos
// (desde el registro del motor) y los pasos siguientes se autogeneran desde el `schema` del módulo.
// Agregar un tipo nuevo NO toca este archivo si usa sólo campos simples (sistema/medida/seg/cards/perfil).
import { computeProject, listModules, getModule } from "../engine/index.mjs";
import { cutList } from "../engine/cuts.mjs";
import { murosDelAmbiente } from "../engine/modules/combinado.mjs";
import { validarVanoPiso, encajarVano, zonaVano } from "../engine/modules/piso.mjs";
import { validarTecho } from "../engine/modules/techo.mjs";
import { TIPO_LABEL, colorHex } from "../viewer/palette.js";
import { secDims } from "../engine/geometry.mjs";
import { getPrice, setPrice, money, loadPrices } from "./prices.js";
import { estadoLicencia, autorizado, iniciarPago, generarPDF, canjearSiVuelve, nuevoProyecto, getProyId, fetchCortes, restaurarPorCodigo, recuperarPorOperacion } from "./licencia.js";
import { PRICING } from "../config/pricing.js";
import { glossHTML, glossForTipo, glossKeyForTipo } from "../content/glosario.js";
import { initGlosario } from "./glosario-ui.js";

const VANO_DEFAULTS = {
  puerta:  { ancho:800,  alto:2050, sill:0   },
  ventana: { ancho:1200, alto:1100, sill:900 },
  arcada:  { ancho:1500, alto:2100, sill:0   } // paso libre; hasta 2,50 m, dintel reforzado si >1,50
};
const VANO_LABEL = { puerta:"Puerta", ventana:"Ventana", arcada:"Arcada" };
const VANO_INI = { puerta:"P", ventana:"V", arcada:"A" };
const VANO_COL = { puerta:"var(--tangerine)", ventana:"#e8b53a", arcada:"#27b0c9" };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

const state = { kind: null, step: 0, params: null, adv: false, tab: "3d", vista3d: null, parte3d: "todo", capas: {}, muroSel: null, quePieza: false };
// Superficies estructurales conmutables del visor: id de capa → etiqueta y tipo (para color de leyenda).
// Superficies conmutables del visor: apoyos de fundación y placa de piso (diafragma estructural).
const CAPA_INFO = {
  "apoyos":     { l: "Apoyos (fundación)",           tipo: "PLATEA" },
  "placa-piso": { l: "Placa de piso (diafragma)",    tipo: "PLACA" }
};
const CAPA_ORDEN = ["apoyos", "placa-piso"];
// Arrancan APAGADAS salvo "apoyos": si el usuario eligió platea/pilotines, se ve de una.
const capaOn = id => state.capas[id] ?? (id === "apoyos");
const capaSwatch = c => colorHex(c.tipo);
function capasDe(piezas){
  const ids = new Set(piezas.filter(p => p.capa).map(p => p.capa));
  return CAPA_ORDEN.filter(id => ids.has(id)).map(id => ({ id, ...CAPA_INFO[id] }));
}
let root, viewer = null, lvlViewer = null, _codeOf = new Map();
function disposeLvlViewer(){ if (lvlViewer){ try { lvlViewer.dispose(); } catch {} lvlViewer = null; } }

// El visor 3D (Three.js, ~el grueso del bundle) se carga BAJO DEMANDA: la grilla de módulos y el
// arranque no lo necesitan. Sale del chunk inicial → menos JS que parsear en el primer render (mejora
// TTI/LCP de /app). Mientras descarga, se muestra un skeleton de las mismas dimensiones (evita CLS).
let ViewerClass = null, _viewerLoad = null;
function cargarVisor(){ return _viewerLoad ||= import("../viewer/viewer.js").then(m => (ViewerClass = m.Viewer)); }
const skeleton3D = `<div class="viewskel" aria-hidden="true"><span class="viewskel-spin"></span>Cargando visor 3D…</div>`;

// Debounce genérico: agrupa ráfagas de eventos (tipeo en las medidas) en una sola ejecución del trabajo
// pesado (recalcular el motor), protegiendo el hilo principal → mejora INP.
function debounce(fn, ms){ let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

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
function pasoValido(paso){
  // El vano de piso fuera de margen es un error BLOQUEANTE: no se avanza (ni se genera geometría inválida).
  if (paso.componente === "vanoPiso" && validarVanoPiso(toEngineInput()).errores.length) return false;
  // Pendiente de techo por debajo del mínimo de escurrimiento: tampoco se avanza.
  if (paso.id === "medidas" && state.kind === "techo" && validarTecho(toEngineInput()).errores.length) return false;
  return [...(paso.campos||[]), ...(paso.avanzado||[])]
    .filter(c => !c.soloSi || c.soloSi(state.params))          // los campos ocultos no bloquean
    .every(c => c.tipo !== "medida" || !errCampo(c));
}

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
       <div class="tb-lic" id="tblic"></div>
     </header>
     <div class="progress" id="progress"></div>
     <section class="content" id="content"></section>
     <nav class="wnav" id="wnav"></nav>`;
  restaurarProyecto(); // si volvemos del pago (o recarga), recuperar el proyecto en curso
  initGlosario();      // glosario integrado: tarjeta al tocar un término subrayado
  cargarVisor();       // precarga en segundo plano: el 3D queda listo antes de llegar al paso 1
  // Link compartido (?p=<medidas>): reabre el proyecto exacto (viene de WhatsApp / lo comparte el usuario).
  const shared = new URLSearchParams(location.search).get("p");
  if (shared){ history.replaceState(null, "", location.pathname); try { cargarProyectoCompartido(shared); } catch (e) { console.warn("[link] proyecto inválido:", e.message); render(); } }
  else render();
  // Si venimos del checkout de Mercado Pago, canjear el pago por la licencia y refrescar la UI.
  // El canje puede adoptar el proyecto pagado como activo, así que restauramos otra vez por si el
  // id se había desincronizado (recién ahí coinciden proyecto y licencia).
  canjearSiVuelve().then(d => { if (d){ restaurarProyecto(); render(); if (d.token) mostrarCodigo(d); } });
}

// ============ licencia: badge, código, recuperación ============
const WPP = "5492914631729";   // WhatsApp de Adamant: contacto, lead del proyecto y habilitación manual
const ALIAS_MP = "adamant";    // alias Personal Pay para transferencia directa (pago manual)
const wppLink = txt => `https://wa.me/${WPP}?text=${encodeURIComponent(txt)}`;
const precioSku = sku => PRICING.skus[sku].precio;

function renderLicBadge(){
  const el = document.getElementById("tblic"); if (!el) return;
  const est = estadoLicencia();
  let txt, cls;
  if (est.tipo === "pase"){ txt = `Pase activo · ${est.dias} día${est.dias!==1?"s":""}`; cls = "ok"; }
  else if (est.tipo === "proyecto"){ txt = "Proyecto desbloqueado"; cls = "ok"; }
  else { txt = "Sin licencia"; cls = "off"; }
  el.innerHTML = `<span class="licpill ${cls}">${txt}</span><button class="licya" id="licya">Ya compré</button>`;
  document.getElementById("licya").onclick = abrirRecuperar;
}

// --- modal genérico ---
function abrirModal(html){
  cerrarModal();
  const ov = document.createElement("div");
  ov.className = "modalov"; ov.id = "modalov";
  ov.innerHTML = `<div class="modal">${html}<button class="modalx" id="modalx" aria-label="Cerrar">✕</button></div>`;
  document.body.appendChild(ov);
  ov.addEventListener("click", e => { if (e.target === ov) cerrarModal(); });
  document.getElementById("modalx").onclick = cerrarModal;
  return ov;
}
function cerrarModal(){ const ov = document.getElementById("modalov"); if (ov) ov.remove(); }

// Código de acceso tras la compra: hay que copiarlo o descargarlo antes de seguir.
function mostrarCodigo(d){
  const est = d.sku === "proyecto" ? "Proyecto desbloqueado — tuyo para siempre."
    : `Pase de obra activo — ${Math.max(0, Math.ceil((d.exp - Date.now())/864e5))} días.`;
  const ov = abrirModal(`<h3>¡Listo! ${est}</h3>
    <p class="msub">Guardá este código de acceso. Con él recuperás tu acceso en cualquier navegador.</p>
    <textarea class="codebox" id="codebox" readonly rows="3">${d.token}</textarea>
    <div class="modalrow"><button class="btn" id="copcod">Copiar</button>
      <button class="btn ghost" id="dlcod">Descargar .txt</button></div>
    <label class="chkvi"><input type="checkbox" id="vicod"> Ya lo copié / descargué</label>
    <button class="btn" id="segcod" disabled>Continuar</button>
    <p class="msub">¿Problemas? Escribinos por <a href="${wppLink('Hola! Tengo un problema con mi código de acceso de Adamant.')}" target="_blank" rel="noopener">WhatsApp</a>.</p>`);
  const marcar = () => { document.getElementById("vicod").checked = true; document.getElementById("segcod").disabled = false; };
  document.getElementById("copcod").onclick = () => { navigator.clipboard?.writeText(d.token).then(marcar, marcar); marcar(); };
  document.getElementById("dlcod").onclick = () => {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([d.token], { type: "text/plain" }));
    a.download = "adamant-codigo.txt"; a.click(); URL.revokeObjectURL(a.href); marcar();
  };
  document.getElementById("vicod").onchange = e => { document.getElementById("segcod").disabled = !e.target.checked; };
  document.getElementById("segcod").onclick = () => { cerrarModal(); render(); };
  ov.querySelector(".modalx").style.display = "none"; // no se cierra hasta confirmar que vio el código
}

// Pantalla "Ya compré": pegar código o ingresar N° de operación de MP.
function abrirRecuperar(){
  abrirModal(`<h3>Ya compré — recuperar acceso</h3>
    <p class="msub">Pegá tu código de acceso, o ingresá el N° de operación de Mercado Pago.</p>
    <label class="mlab">Código de acceso</label>
    <textarea class="codebox" id="reccod" rows="3" placeholder="pegá el código acá"></textarea>
    <button class="btn" id="reccodbtn">Restaurar con el código</button>
    <div class="modalsep">o</div>
    <label class="mlab">N° de operación de Mercado Pago</label>
    <input class="minput" id="recop" inputmode="numeric" placeholder="ej. 1234567890">
    <button class="btn ghost" id="recopbtn">Recuperar con la operación</button>
    <p class="recmsg" id="recmsg"></p>
    <p class="msub">¿No encontrás ninguno? Escribinos por <a href="${wppLink('Hola! No puedo recuperar mi acceso a Adamant.')}" target="_blank" rel="noopener">WhatsApp</a>.</p>`);
  const msg = document.getElementById("recmsg");
  document.getElementById("reccodbtn").onclick = () => {
    try { restaurarPorCodigo(document.getElementById("reccod").value); cerrarModal(); render(); }
    catch (e) { msg.textContent = "Error: " + e.message; }
  };
  document.getElementById("recopbtn").onclick = async () => {
    msg.textContent = "Verificando en Mercado Pago…";
    try { await recuperarPorOperacion(document.getElementById("recop").value); cerrarModal(); render(); }
    catch (e) { msg.textContent = "Error: " + e.message; }
  };
}

function render(){
  guardarProyecto();
  disposeLvlViewer();
  const nPasos = state.kind ? pasosOf().length : 0;
  const enResultado = state.kind && state.step === nPasos + 1;
  if (viewer && !enResultado){ viewer.dispose(); viewer = null; }
  renderProgress();
  const c = document.getElementById("content");
  const enConfig = state.step >= 1 && !enResultado;
  c.classList.toggle("noscroll", enResultado);
  c.classList.toggle("workmode", enConfig);   // dos columnas: controles + visor a toda la altura
  if (state.step === 0){ c.innerHTML = stepGrid(); wireGrid(); }
  else if (enResultado){ c.innerHTML = stepResultado(); wireResultado(); }
  else {
    const paso = pasosOf()[state.step - 1];
    // Workspace: controles a la izquierda, visor en vivo a la derecha (llena la columna).
    c.innerHTML = `<div class="ws-controls">${stepPaso(paso)}</div><div class="ws-view"><div class="lvlview" id="lvlview"></div></div>`;
    wirePaso(paso);
  }
  renderNav();
  renderLicBadge();
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
    const fase = state.step === 0 ? 0 : enResultado ? 3
      : (compo === "vanos" || compo === "murosPlanta" || (state.kind === "combinado" && state.step >= 2)) ? 2 : 1;
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
// Ícono de cada módulo (trazo teal) + su versión "marca de agua" (ghost) abajo a la derecha. Mismo
// path para los dos, como en las tarjetas de la landing.
const svg = (p, cls) => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const MOD_PATH = {
  muro:  '<rect x="4" y="3" width="4" height="18" rx="1"/><rect x="10" y="3" width="4" height="18" rx="1"/><rect x="16" y="3" width="4" height="18" rx="1"/>',
  piso:  '<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  cielo: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  techo: '<path d="M3 12 12 4l9 8"/><path d="M6 12l6 4 6-4"/>',
  combinado: '<path d="M3 10 12 3l9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/>'
};
const modIco = id => MOD_PATH[id] ? svg(MOD_PATH[id], "mod-ico") : "";
const modGhost = id => MOD_PATH[id] ? svg(MOD_PATH[id], "ghost-ico") : "";
// Descripción del Ambiente = resumen de los módulos en el orden real del flujo por niveles.
const AMB_DESC = "Piso, cuatro paredes con sus aberturas, cielorraso y techo. Todo armado por niveles y ubicado en su lugar, con cómputo, cortes y PDF de todo junto.";

// Arranque rápido (onboarding): un toque → estructura armada y editable en pantalla, sin pelear con un
// formulario vacío. Son proyectos NORMALES (gate del entregable como cualquiera), sólo un punto de partida.
const VN = (tipo, ancho, alto, sill, pos) => ({ tipo, ancho, alto, sill, pos });
const PRESETS = [
  { l: "Quincho 4×6", kind: "combinado", over: { largo: 6000, ancho: 4000, vanoFrente: [VN("puerta", 900, 2050, 0, 3000)], vanoIzq: [VN("ventana", 1200, 1100, 900, 2000)], llevaTecho: true, techoTipo: "dosAguas" } },
  { l: "Ampliación 3×4", kind: "combinado", over: { largo: 4000, ancho: 3000, vanoFrente: [VN("ventana", 1200, 1100, 900, 2000)] } },
  { l: "Muro con ventana", kind: "muro", over: { largo: 4000, alto: 2600, vanos: [VN("ventana", 1200, 1100, 900, 2000)] } },
  { l: "Techo a dos aguas", kind: "techo", over: { tipo: "dosAguas", luz: 4000, largo: 6000 } }
];
// Abre un proyecto (preset o compartido) directo en el RESULTADO: 3D + solapas, editable con "Editar".
function abrirProyecto(kind, params){
  if (!KINDS.has(kind)) return;
  state.kind = kind; state.params = params;
  nuevoProyecto(); // projectHash propio → gate normal del entregable
  state.vista3d = null; state.parte3d = "todo"; state.capas = {}; state.muroSel = null; state.tab = "3d";
  state.step = pasosOf().length + 1; // salta al resultado
  render();
}
function cargarPreset(i){
  const pr = PRESETS[i]; if (!pr) return;
  const params = structuredClone(getModule(pr.kind).defaults());
  Object.assign(params, pr.over);
  abrirProyecto(pr.kind, params);
}
// Link que reabre EXACTAMENTE este proyecto (medidas serializadas en la URL). Es lo que viaja por
// WhatsApp: el lead nos llega con el proyecto adentro, sin backend ni cuentas.
function linkProyecto(){
  const data = JSON.stringify({ k: state.kind, p: state.params });
  const enc = btoa(unescape(encodeURIComponent(data))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return location.origin + "/app?p=" + enc;
}
function cargarProyectoCompartido(enc){
  let s = String(enc).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
  const { k, p } = JSON.parse(decodeURIComponent(escape(atob(s))));
  if (k && p) abrirProyecto(k, p); else render();
}
function resumenProyecto(){
  const p = state.params, sis = p.sistema === "wood" ? "wood frame" : "steel frame";
  if (state.kind === "combinado") return `ambiente ${p.largo/1000}×${p.ancho/1000} m, ${sis}`;
  if (state.kind === "muro") return `muro ${p.largo/1000}×${p.alto/1000} m, ${sis}`;
  if (state.kind === "techo") return `techo ${p.tipo === "dosAguas" ? "dos aguas" : "un agua"}, ${sis}`;
  return `${getModule(state.kind).nombre}, ${sis}`;
}
function stepGrid(){
  const card = m => {
    const amb = m.id === "combinado";
    return `<button class="mod ${m.id==="piso"?"warm":""} ${amb?"mod-amb":""} ${state.kind===m.id?'on':''}" data-id="${m.id}">
      ${modIco(m.id) || `<span class="mod-ico">${m.icono}</span>`}
      ${amb ? `<span class="mod-tag">Flujo completo</span>` : ""}
      <h3>${m.nombre}</h3><p>${amb ? AMB_DESC : m.descripcion}</p>${modGhost(m.id)}</button>`;
  };
  return `<header class="gridhead"><h2>¿Qué vas a construir?</h2>
    <p class="sub">Tocá un ejemplo listo para verlo en 3D al toque, o elegí un módulo desde cero.</p>
    <div class="presets">${PRESETS.map((p, i) => `<button class="preset" data-preset="${i}">${p.l}</button>`).join("")}</div>
    </header>
    <div class="mods">${listModules().map(card).join("")}</div>`;
}
function wireGrid(){
  document.querySelectorAll(".mods .mod").forEach(b => b.onclick = () => {
    if (state.kind !== b.dataset.id){ state.kind = b.dataset.id; state.params = structuredClone(getModule(state.kind).defaults()); state.vista3d = null; state.parte3d = "todo"; state.capas = {}; state.muroSel = null; }
    state.step = 1; render();
  });
  document.querySelectorAll("[data-preset]").forEach(b => b.onclick = () => cargarPreset(+b.dataset.preset));
}

// ---------- pasos autogenerados ----------
// Niveles del Ambiente → qué partes resalta el visor en cada paso.
const NIVEL_PARTES = { suelo: ["piso"], muros: ["frente","fondo","izq","der"], cielo: ["cielo"], techo: ["techo"] };
// Vista 3D en vivo del ambiente mientras se recorren los niveles: el nivel activo resaltado, los ya
// armados semi-transparentes. Se regenera con cada cambio (el paso se re-renderiza al tocar un campo).
// Orden de armado REAL por nivel (por tipo de pieza): lo usa el "momento maravilla".
const ARMADO = {
  suelo: ["CENEFA","VIGA_DOBLE","TRIMMER","VIGA","CABEZAL","VIGA_COLA","BLOCKING"],
  muros: ["SOL.PANEL","SOL.VANO","SOL.DINTEL","MONTANTE","KING","JACK","DINTEL","CRIPPLE","FLEJE"],
  cielo: ["SOLERA","MONTANTE","MAESTRA","VELA"],
  techo: ["CORDON_INFERIOR","CORDON_SUPERIOR","DIAGONAL","MONTANTE_CABRIADA","MONTANTE_TIMPANO","CORREA","FLEJE","FLEJE_CIELO"]
};
let _lastNivelStep = null;
function renderNivelPreview(paso){
  const host = document.getElementById("lvlview"); if (!host) return;
  if (!ViewerClass){ host.innerHTML = skeleton3D; cargarVisor().then(() => { if (document.getElementById("lvlview")) renderNivelPreview(paso); }); return; }
  const partes = NIVEL_PARTES[paso.id]; // sólo el Ambiente resalta por nivel; el resto muestra todo
  try {
    host.innerHTML = ""; // limpiar el skeleton antes de montar el canvas
    const { piezas, metadatos } = computeProject(toEngineInput());
    lvlViewer = new ViewerClass(host, { onSelect: () => {} });
    lvlViewer.setPieces(piezas.filter(p => !p.superficie), { vista: metadatos.vistaDefault || "iso", elevacion: metadatos.elevacion || 0 });
    if (partes){
      lvlViewer.highlight(partes);
      // Momento maravilla: sólo al ENTRAR al nivel (no en cada toque de campo del mismo nivel).
      if (_lastNivelStep !== state.step){ _lastNivelStep = state.step; lvlViewer.playAssembly(partes, ARMADO[paso.id]); }
    }
  } catch (e) {
    // Sin WebGL: el workspace vuelve a una columna (controles a todo el ancho), sin caja vacía.
    console.warn("preview no disponible (WebGL):", e && e.message);
    const ws = host.closest(".ws-view"); if (ws) ws.remove();
    document.getElementById("content")?.classList.remove("workmode");
  }
}
// Micro-explicación por nivel: 2-3 líneas de "qué estás construyendo y por qué". Colapsable; la
// preferencia (abierto/cerrado) se recuerda en localStorage y aplica a todos los niveles.
const INTRO_KEY = "adamant_intros_off";
const introsOff = () => { try { return localStorage.getItem(INTRO_KEY) === "1"; } catch { return false; } };
function introHTML(paso){
  if (!paso.intro) return "";
  const off = introsOff();
  return `<div class="intro ${off?'off':''}" id="intro">
    <button type="button" class="intro-h" id="introToggle"><span class="ico">${off?"▸":"▾"}</span> Qué estás construyendo</button>
    <p class="intro-b">${glossHTML(paso.intro)}</p></div>`;
}
function stepPaso(paso){
  let html = `<h2>${paso.titulo}</h2>` + nivelesBar() + introHTML(paso);
  if (paso.componente === "vanos") html += vanosHTML();
  else if (paso.componente === "murosPlanta") html += murosPlantaHTML();
  else if (paso.componente === "vanoPiso") html += vanoPisoHTML();
  else {
    html += (paso.campos || []).map(campoHTML).join("");
    const adv = (paso.avanzado || []).map(campoHTML).join("");   // vacío si todos los avanzados están ocultos
    if (adv.trim())
      html += `<button class="adv-toggle" id="advt">${state.adv?"▾":"▸"} Opciones avanzadas</button>
        <div class="adv ${state.adv?'':'hide'}">${adv}</div>`;
  }
  // Ambiente · paso Suelo: medida interior libre en vivo (ingresás exterior, ves qué te queda adentro).
  if (state.kind === "combinado" && paso.id === "suelo") html += `<div class="interlibre" id="interlibre">${interiorTxt()}</div>`;
  return html;
}
// Interior libre = exterior − 2·espesor de muro (el dato de replanteo). Se recalcula del motor.
function interiorTxt(){
  try { const it = computeProject(toEngineInput()).metadatos.interior;
    return it ? `Interior libre: <b>${it.x.toLocaleString("es-AR")} × ${it.y.toLocaleString("es-AR")} mm</b>` : ""; }
  catch { return ""; }
}
function actualizarInterior(){ const el = document.getElementById("interlibre"); if (el) el.innerHTML = interiorTxt(); }
// Stepper vertical de niveles (sólo Ambiente completo): muestra los pasos como niveles; los ya
// completados (o el actual) son clickeables para volver. Es funcionalidad real (navegación), no decorado.
function nivelesBar(){
  if (state.kind !== "combinado") return "";
  const pasos = pasosOf(), cur = state.step;
  return `<div class="niveles" id="niveles">${pasos.map((ps, i) => {
    const n = i + 1, active = n === cur, done = n < cur;
    return `<button type="button" class="nivel ${active?'on':''} ${done?'done':''}" ${n<=cur?`data-nivel="${n}"`:"disabled"}>
      <i>${done?"✓":n}</i><span>${ps.titulo}</span></button>`;
  }).join("")}</div>`;
}
function segHTML(key, val, opciones){
  return `<div class="seg" data-seg="${key}">${opciones.map(o => `<button data-v="${o.v}" class="${String(val)===String(o.v)?'on':''}">${o.l}</button>`).join("")}</div>`;
}
function perfilHTML(){
  const p = state.params.opciones, wood = state.params.sistema === "wood";
  const opt = (arr, sel) => arr.map(o => `<option ${o===sel?'selected':''}>${o}</option>`).join("");
  if (wood)
    return `<label class="lbl">Escuadría</label><select data-opt="lumber">${opt(["2x3 (38×64)","2x4 (38×89)","2x6 (38×140)","2x8 (38×184)","2x10 (38×235)"], p.lumber)}</select>`;
  // Tabique steel: perfilería liviana de tabique (montante/solera 70 o 90), no PGC/PGU estructural.
  if (state.params.tipoMuro === "tabique")
    return `<label class="lbl">${glossHTML("Montante")} de placa</label><select data-opt="montPlaca">${opt(["Montante 70","Montante 90"], p.montPlaca || "Montante 70")}</select>`;
  return `<label class="lbl">Perfil montante / viga (PGC)</label><select data-opt="pgc">${opt(["PGC 90x0.90","PGC 100x0.90","PGC 100x1.25","PGC 140x0.90","PGC 150x1.60","PGC 200x1.60"], p.pgc)}</select>
       <label class="lbl">Perfil solera / cenefa (PGU)</label><select data-opt="pgu">${opt(["PGU 90x0.90","PGU 100x0.90","PGU 100x1.25","PGU 140x0.90","PGU 150x1.60","PGU 200x1.60"], p.pgu)}</select>`;
}
function campoHTML(c){
  if (c.soloSi && !c.soloSi(state.params)) return ""; // campo condicional (p. ej. sólo si el ambiente lleva techo)
  const v = getVal(c), lbl = glossHTML(c.label); // subraya los términos técnicos de la etiqueta
  if (c.tipo === "sistema") return `<label class="lbl">Sistema</label>${segHTML("sistema", state.params.sistema, [{v:"steel",l:"Steel frame"},{v:"wood",l:"Wood frame"}])}`;
  if (c.tipo === "cards")   return `<label class="lbl">${lbl}</label><div class="cards" data-cards="${c.k}">${c.opciones.map(o => `<button class="card ${v===o.v?'on':''}" data-v="${o.v}"><b>${o.titulo}</b><span>${o.desc}</span></button>`).join("")}</div>`;
  if (c.tipo === "medida"){ const err = errCampo(c); return `<label class="lbl">${lbl}</label><div class="field ${err?'bad':''}"><input type="text" inputmode="decimal" autocomplete="off" data-medida="${c.k}" value="${(v||0)/1000}"><span class="unit">m</span>${err?`<small>${err}</small>`:""}</div>`; }
  if (c.tipo === "seg")     return `<label class="lbl">${lbl}</label>${segHTML((c.opt?"opt:":"") + c.k, v, c.opciones)}`;
  if (c.tipo === "perfil")  return perfilHTML();
  return "";
}
function wirePaso(paso){
  document.querySelectorAll("[data-nivel]").forEach(b => b.onclick = () => { state.step = +b.dataset.nivel; render(); });
  const it = document.getElementById("introToggle");
  if (it) it.onclick = () => {
    const off = !introsOff(); try { localStorage.setItem(INTRO_KEY, off ? "1" : "0"); } catch {}
    document.getElementById("intro").classList.toggle("off", off);
    it.querySelector(".ico").textContent = off ? "▸" : "▾";
  };
  renderNivelPreview(paso);
  if (paso.componente === "vanos"){ wireVanos(); return; }
  if (paso.componente === "murosPlanta"){ wireMurosPlanta(); return; }
  if (paso.componente === "vanoPiso"){ wireVanoPiso(); return; }
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
  // El tipeo actualiza el estado de inmediato (barato), pero la parte pesada — validación + recálculo
  // del motor para el "interior libre" — se DEBOUNCEA para no correr computeProject en cada tecla (INP).
  document.querySelectorAll("[data-medida]").forEach(inp => {
    const recalc = debounce(() => {
      renderNav(); inp.parentElement.classList.toggle("bad", !!errCampo(findCampo(paso, inp.dataset.medida)));
      actualizarInterior();
    }, 120);
    inp.oninput = () => {
      state.params[inp.dataset.medida] = Math.round(parseNum(inp.value) * 1000);
      recalc();
    };
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
      <div class="vhead"><b>${VANO_LABEL[v.tipo]} ${i+1}${v.ancho > 1500 ? ` · ${glossHTML("dintel")} doble` : ""}</b><button class="x" data-del="${i}">✕</button></div>
      <div class="vgrid">
        <label>Ancho<input type="number" data-k="ancho" data-i="${i}" value="${v.ancho}"><i>mm</i></label>
        <label>Alto<input type="number" data-k="alto" data-i="${i}" value="${v.alto}"><i>mm</i></label>
        <label>${glossHTML("Antepecho")}<input type="number" data-k="sill" data-i="${i}" value="${v.sill}" ${sinSill?'disabled':''}><i>mm</i></label>
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

// ---------- componente custom: vano de escalera/trampa del piso (planta) ----------
// El vano se declara en coords DEL ENTRAMADO: X = corrida (lado mayor), Y = luz (lado menor), igual
// que la planta que reporta el módulo. Por eso se dibuja con corrida en horizontal.
const PRESETS_VANO = [{ l: "Trampa 600×600", ancho: 600, largo: 600 }, { l: "Escalera recta 1000×3000", ancho: 1000, largo: 3000 }];
function pisoPlanta(){
  const p = state.params, L = +p.largo, W = +p.ancho;
  return { corrida: Math.max(L, W), luz: Math.min(L, W), sep: +p.separacion || 400 };
}
function vanoPisoHTML(){
  const v = state.params.vano;
  const { corrida, luz, sep } = pisoPlanta();
  if (!v) return `<p class="sub">Un hueco para escalera o trampa de acceso. Se enmarca solo: trimmers a los
      lados, cabezales arriba y abajo, y las vigas cortadas pasan a vigas cola.</p>
    <div class="addrow"><button class="btn sm" id="vpAdd">＋ Agregar vano</button></div>
    <p class="sub">Entramado ${corrida}×${luz} mm · modulación ${sep} mm.</p>`;
  const { errores, avisos } = validarVanoPiso(toEngineInput());
  const { maxAncho, maxLargo } = zonaVano(state.params);
  return `<p class="sub">Arrastrá el hueco sobre la planta (se acomoda solo a la modulación de ${sep} mm).
    Máximo que entra acá: <b>${maxAncho}×${maxLargo} mm</b>.</p>
    <div class="addrow">${PRESETS_VANO.map((q, i) => `<button class="btn sm" data-preset="${i}">${q.l}</button>`).join("")}
      <button class="btn sm" id="vpGirar">⟲ Girar</button><button class="btn sm" id="vpDel">✕ Quitar</button></div>
    <div class="planta4" id="vpPlanta"></div>
    ${state.vanoAjustes?.length ? `<div class="avisos"><b>✓ Lo acomodé</b>${state.vanoAjustes.map(a => `<span>${a}</span>`).join("")}</div>` : ""}
    ${errores.length ? `<div class="errores"><b>⛔ Así no entra</b>${errores.map(e => `<span>${e}</span>`).join("")}
      <button class="btn sm" id="vpFix">Acomodar</button></div>` : ""}
    ${avisos.length ? `<div class="avisos"><b>⚠ Vano</b>${avisos.map(a => `<span>${a}</span>`).join("")}
      ${avisos.some(a => /cabezal/.test(a)) ? `<button class="btn sm" id="vpAngosto">Achicar el ancho a 1200 mm</button>` : ""}</div>` : ""}
    <div class="vgrid">
      <label>Posición X (corrida)<input type="number" data-vp="x" value="${v.x}"><i>mm</i></label>
      <label>Posición Y (luz)<input type="number" data-vp="y" value="${v.y}"><i>mm</i></label>
      <label>Ancho (⊥ vigas)<input type="number" data-vp="ancho" value="${v.ancho}"><i>mm</i></label>
      <label>Largo (∥ vigas)<input type="number" data-vp="largo" value="${v.largo}"><i>mm</i></label>
    </div>`;
}
function drawVanoPlanta(){
  const box = document.getElementById("vpPlanta"); if (!box) return;
  const v = state.params.vano; if (!v) return;
  const { corrida, luz } = pisoPlanta();
  const Wd = box.clientWidth || 340, pad = 12;
  const iw = Wd - 2*pad, ih = Math.max(90, Math.min(230, iw * luz / corrida));
  const H = ih + 2*pad, sx = iw / corrida, sy = ih / luz;
  // Y del motor crece hacia "arriba"; en el SVG se invierte para que la planta se lea natural.
  const X = x => pad + x * sx, Y = y => pad + ih - y * sy;
  const nV = Math.floor(corrida / (+state.params.separacion || 400));
  let lineas = "";
  for (let i = 1; i <= nV; i++){ const x = X(i * (+state.params.separacion || 400)); lineas += `<line x1="${x.toFixed(1)}" y1="${pad}" x2="${x.toFixed(1)}" y2="${(pad+ih).toFixed(1)}" class="vpvig"/>`; }
  box.innerHTML = `<svg viewBox="0 0 ${Wd} ${H}" width="${Wd}" height="${H}" class="plantasvg">
    <rect x="${pad}" y="${pad}" width="${iw}" height="${ih}" class="room"/>${lineas}
    <g class="vphole" id="vphole"><rect x="${X(v.x).toFixed(1)}" y="${Y(v.y + v.largo).toFixed(1)}"
      width="${(v.ancho*sx).toFixed(1)}" height="${(v.largo*sy).toFixed(1)}" rx="2"/>
      <text x="${X(v.x + v.ancho/2).toFixed(1)}" y="${(Y(v.y + v.largo/2) + 4).toFixed(1)}" text-anchor="middle">${v.ancho}×${v.largo}</text></g></svg>`;
  box._geo = { pad, sx, sy, ih };
  box.querySelector("#vphole").addEventListener("pointerdown", startVanoPisoDrag);
}
function startVanoPisoDrag(e){
  e.preventDefault();
  const box = document.getElementById("vpPlanta"), { pad, sx, sy, ih } = box._geo;
  const v = state.params.vano, { sep } = pisoPlanta();
  const { m, corrida, luz } = zonaVano(state.params);
  const rect = box.querySelector("svg").getBoundingClientRect();
  const snap = n => Math.round(n / sep) * sep;
  const move = ev => {
    // El puntero toma el CENTRO del hueco; se snapea a la modulación y se limita al margen de apoyo,
    // así arrastrando NUNCA se llega a un vano inválido.
    const cx = (ev.clientX - rect.left - pad) / sx, cy = (ih - (ev.clientY - rect.top - pad)) / sy;
    v.x = Math.min(Math.max(snap(cx - v.ancho/2), m), corrida - m - v.ancho);
    v.y = Math.min(Math.max(snap(cy - v.largo/2), m), luz - m - v.largo);
    drawVanoPlanta();
  };
  const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); render(); };
  window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
}
// Aplica un vano pasándolo SIEMPRE por el acomodador: nunca deja al usuario en un estado inválido.
function ponerVano(v){
  const { vano, ajustes } = encajarVano(state.params, v);
  state.params.vano = vano; state.vanoAjustes = ajustes;
  render();
}
function wireVanoPiso(){
  const add = document.getElementById("vpAdd");
  if (add){
    add.onclick = () => { const { corrida, luz } = pisoPlanta();
      ponerVano({ x: Math.round(corrida/2 - 300), y: Math.round(luz/2 - 300), ancho: 600, largo: 600 }); };
    return;
  }
  const del = document.getElementById("vpDel"); if (del) del.onclick = () => { state.params.vano = null; state.vanoAjustes = null; render(); };
  const fix = document.getElementById("vpFix"); if (fix) fix.onclick = () => ponerVano(state.params.vano);
  const ang = document.getElementById("vpAngosto"); if (ang) ang.onclick = () => ponerVano({ ...state.params.vano, ancho: 1200 });
  const gir = document.getElementById("vpGirar"); if (gir) gir.onclick = () => {
    const v = state.params.vano; ponerVano({ ...v, ancho: v.largo, largo: v.ancho });
  };
  document.querySelectorAll("[data-preset]").forEach(b => b.onclick = () => {
    const q = PRESETS_VANO[+b.dataset.preset], { corrida, luz } = pisoPlanta();
    ponerVano({ x: Math.round((corrida - q.ancho)/2), y: Math.round((luz - q.largo)/2), ancho: q.ancho, largo: q.largo });
  });
  document.querySelectorAll("[data-vp]").forEach(inp => inp.onchange = () => { // al salir del campo, lo acomodo
    ponerVano({ ...state.params.vano, [inp.dataset.vp]: Math.round(parseFloat(inp.value) || 0) });
  });
  drawVanoPlanta();
}

// ---------- combinado: aberturas por muro (esquema en planta) ----------
function murosPlantaHTML(){
  if (state.muroSel){
    const m = murosDelAmbiente(state.params).find(x => x.parte === state.muroSel);
    return `<div class="muroedit"><button class="btn ghost sm" id="volverPlanta">← Planta</button>
      <b>${m.l} · ${(m.largo/1000).toFixed(2)} m</b></div>${vanosHTML()}`;
  }
  const pas = state.params.pasante === "laterales" ? "laterales" : "frenteFondo";
  return `<label class="lbl">${glossHTML("¿Qué paredes corren de punta a punta?")}</label>
    <p class="sub" style="margin-top:0">Las pasantes se cruzan enteras; las otras encajan entre ellas y llevan el montante de arranque en la esquina.</p>
    ${segHTML("pasante", pas, [{ v: "frenteFondo", l: "Frente y Fondo" }, { v: "laterales", l: "Laterales" }])}
    <p class="sub">Tocá un muro para agregarle puertas, ventanas o arcadas.</p><div class="planta4" id="planta4"></div>`;
}
function wireMurosPlanta(){
  if (state.muroSel){
    document.getElementById("volverPlanta").onclick = () => { state.muroSel = null; render(); };
    wireVanos(); return;
  }
  document.querySelectorAll('[data-seg="pasante"] button').forEach(b => b.onclick = () => { state.params.pasante = b.dataset.v; render(); });
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
    // Visor aún no descargado: skeleton (mismas dimensiones → sin CLS) y re-render al terminar.
    if (!ViewerClass){ body.innerHTML = `<div class="viewer" id="viewer3d">${skeleton3D}</div>`; cargarVisor().then(() => { if (state.tab === "3d") renderTab(); }); return; }
    const { piezas, metadatos } = computeProject(toEngineInput());
    const vistas = vistasDe(metadatos);
    if (!state.vista3d || !vistas.some(v => v.id === state.vista3d)) state.vista3d = metadatos.vistaDefault || vistas[0].id;
    // Sin toggle de vista: sólo cambiaba el ángulo de cámara (Conjunto/Planta/etc.), no la geometría.
    // Cada módulo abre en su cámara por defecto (`vistaDefault`) y el usuario orbita libremente.
    // "ver por partes" (módulo combinado): Todo + cada parte (piso / muros)
    const partes = metadatos.partes || null;
    if (partes && !["todo", ...partes.map(p => p.id)].includes(state.parte3d)) state.parte3d = "todo";
    const partesel = partes
      ? `<div class="partesel" id="partesel">${[{ id: "todo", l: "Todo" }, ...partes].map(p => `<button data-p="${p.id}" class="${state.parte3d===p.id?'on':''}">${p.l}</button>`).join("")}</div>` : "";
    // panel de SUPERFICIES conmutables (apoyos + placa de piso): checkboxes independientes, arrancan apagadas
    const capas = capasDe(piezas);
    const capasPanel = capas.length
      ? `<div class="capas" id="capaspanel"><b>Capas</b>${capas.map(c => `<label><input type="checkbox" data-capa="${c.id}" ${capaOn(c.id)?'checked':''}><i style="background:${capaSwatch(c)}"></i>${c.l}</label>`).join("")}</div>` : "";
    // Mapa código de corte por pieza (tipo|perfil|largo → código J1/K1/D1…), para el "¿Qué es esto?".
    _codeOf = new Map(); cutList(piezas).groups.forEach(g => _codeOf.set(g.tipo + "|" + g.perfil + "|" + g.largo, g.code));
    // Botón "¿Qué es esto?": modo educativo. Al tocar una pieza, además del nombre muestra para qué
    // sirve y su código en la lista de cortes. Sin leyenda fija (tapaba el modelo).
    const qOn = state.quePieza ? " on" : "";
    body.innerHTML = `<div class="viewer ${partes?'hasparts':''}" id="viewer3d">${partesel}${capasPanel}
      <button class="qbtn${qOn}" id="qbtn" title="Modo aprender: tocá una pieza y te digo qué es">💡 ¿Qué es esto?</button>
      <div class="info hidden" id="info3d"></div>
      <p class="hint">Girá con un dedo · pellizcá zoom · dos dedos desplazar · <b>tocá una pieza para ver qué es</b></p></div>`;
    try {
      viewer = new ViewerClass(document.getElementById("viewer3d"), { onSelect: showInfo3d });
      const mostrar = () => (partes && state.parte3d !== "todo") ? piezas.filter(p => p.parte === state.parte3d) : piezas;
      const aplicarCapas = () => capas.forEach(c => { if (capaOn(c.id)) viewer.setLayerVisible(c.id, true); });
      viewer.setPieces(mostrar(), { vista: state.vista3d, elevacion: metadatos.elevacion || 0 }); aplicarCapas();
      const ps = document.getElementById("partesel");
      if (ps) ps.querySelectorAll("button").forEach(b => b.onclick = () => {
        state.parte3d = b.dataset.p; ps.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
        viewer.setPieces(mostrar(), { vista: state.vista3d, elevacion: metadatos.elevacion || 0 }); aplicarCapas();
      });
      const cp = document.getElementById("capaspanel");
      if (cp) cp.querySelectorAll("input[data-capa]").forEach(chk => chk.onchange = () => {
        state.capas[chk.dataset.capa] = chk.checked; viewer.setLayerVisible(chk.dataset.capa, chk.checked);
      });
      const qb = document.getElementById("qbtn");
      if (qb) qb.onclick = () => { state.quePieza = !state.quePieza; qb.classList.toggle("on", state.quePieza);
        if (!state.quePieza) viewer.clearSelection(); };
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
  const nombre = `<b><i class="dot" style="background:${colorHex(p.tipo)}"></i>${TIPO_LABEL[p.tipo]||p.tipo}</b>`;
  // Bloque EDUCATIVO ("¿Qué es esto?"): para qué sirve la pieza + dónde aparece en la lista de cortes.
  let edu = "";
  if (state.quePieza){
    const g = glossForTipo(p.tipo);
    const code = _codeOf.get(p.tipo + "|" + p.perfil + "|" + p.largo);
    edu = `${g ? `<div class="eduwhy">${g.def}${g.fn ? ` <b>${g.fn}</b>` : ""}</div>` : ""}`
      + (code ? `<div class="row">En cortes: <b>${code}</b>${p.largo ? ` · ${p.largo} mm` : ""}</div>` : "");
  }
  // Superficies (apoyos de fundación, placa de piso): no son un perfil de barra. Se muestran
  // sus dimensiones desde la caja (o el Ø del pilotín), no una sección/largo que no tienen.
  if (p.superficie){
    const [sx, sy, sz] = (p.box?.size || []).map(Math.round);
    const dim = p.forma === "cilindro" ? `Ø ${p.r*2} mm · ${sz} mm de profundidad`
      : (sx != null ? `${sx} × ${sy} × ${sz} mm` : "");
    el.innerHTML = `${nombre}${edu}<div class="row">${p.perfil || "Superficie"}</div>${dim ? `<div class="row">${dim}</div>` : ""}`;
    return;
  }
  // OJO: `axis` NO existe en las piezas diagonales (cabriada, flejes), que traen su base propia
  // `orient`. Además el eje no le sirve a quien construye: lo que necesita es qué perfil es y cuánto
  // mide. El punto de color reemplaza a la leyenda fija que antes tapaba el modelo.
  const s = secDims(p.perfil);
  const sec = p.categoria === "fleje" ? "" : ` · ${Math.round(s.h)} × ${Math.round(s.b)} mm`;
  el.innerHTML = `${nombre}${edu}
    <div class="row">${p.perfil}${sec}</div>
    <div class="row">Largo <b>${p.largo} mm</b></div>`;
}

// ---------- materiales ----------
// Unidad de venta con el largo comercial REAL del perfil (6,00 m barra / 3,05 · 3,00 · 4,88 m tira).
const unidadBarra = len => `${len >= 6000 ? "barra" : "tira"} ${(len/1000).toFixed(2).replace(".", ",")} m`;
// Cada aviso/error de validación se convierte en una TARJETA DE SOLUCIÓN: (1) qué está mal en simple,
// (2) por qué importa, (3) uno o más botones que arreglan los parámetros con un click. Premisa: nunca
// "consultá a un profesional" como única salida — siempre una acción aplicable o alternativas válidas.
function solucionesDe(metadatos){
  const cards = [], p = state.params, kind = state.kind, av = metadatos?.avisos || [], err = metadatos?.errores || [];
  const set = patch => () => Object.assign(p, patch);

  // TECHO — pendiente fuera del rango del manual
  if (kind === "techo"){
    const pend = +p.pendiente;
    if (pend >= 7 && pend < 25)
      cards.push({ tono:"aviso", titulo:`La pendiente (${pend} %) es baja para el manual`,
        porque:"Con poca pendiente el agua escurre lento y la chapa puede filtrar.",
        acciones:[{ label:"Subir a 25 % (recomendada)", run: set({ pendiente:25 }) }] });
    else if (pend > 100)
      cards.push({ tono:"aviso", titulo:`La pendiente (${pend} %) es muy pronunciada`,
        porque:"Arriba de 45° el anclaje de la cubierta se complica.",
        acciones:[{ label:"Bajar a 100 %", run: set({ pendiente:100 }) }] });
    // Faldón muy largo respecto de la luz: el fleje del faldón queda casi horizontal.
    if (av.some(a => /Faldón del techo/.test(a))){
      const cos = Math.cos(Math.atan(pend/100));
      const largoF = Math.round((p.tipo === "dosAguas" ? (+p.luz/2 + (+p.alero||0)) : (+p.luz + 2*(+p.alero||0))) / cos);
      cards.push({ tono:"aviso", titulo:"El techo es muy largo para arriostrar el faldón",
        porque:"El fleje del faldón queda casi horizontal y deja de trabajar como arriostre.",
        acciones:[{ label:`Achicar el largo a ${largoF} mm`, run: set({ largo: largoF }) }] });
    }
  }

  // MURO / AMBIENTE — la Cruz de San Andrés no entra (paño lleno de aberturas o muy angosto)
  const brace = av.some(a => /arriostrar|ángulo de fleje/.test(a));
  if (brace && kind === "muro")
    cards.push({ tono:"aviso", titulo:"No hay lugar para la Cruz de San Andrés",
      porque:"El arriostramiento mantiene el muro a escuadra ante el viento y los empujes; si el paño está lleno de aberturas, no entra la diagonal.",
      acciones:[
        { label:"Quitar el arriostramiento", run: set({ arriostramiento:"ninguno" }) }
      ] });
  if (brace && kind === "combinado")
    cards.push({ tono:"aviso", titulo:"Algún muro no tiene lugar para la Cruz de San Andrés",
      porque:"El arriostramiento mantiene el ambiente a escuadra ante el viento y los empujes.",
      acciones:[
        { label:"Quitar el arriostramiento", run: set({ arriostraFrente:"ninguno", arriostraFondo:"ninguno", arriostraIzq:"ninguno", arriostraDer:"ninguno" }) }
      ] });

  // PISO — vano de escalera/trampa
  if (kind === "piso" && p.vano){
    if (av.some(a => /cabezal/.test(a)))
      cards.push({ tono:"aviso", titulo:`El vano es ancho para los cabezales (${p.vano.ancho} mm)`,
        porque:"Un cabezal largo flexiona; conviene acotarlo para que trabaje sin refuerzos especiales.",
        acciones:[{ label:"Achicar el ancho a 1200 mm", run(){ p.vano = encajarVano(p, { ...p.vano, ancho:1200 }).vano; } }] });
    if (err.length)
      cards.push({ tono:"error", titulo:"El hueco no entra donde está",
        porque:"Los cabezales tienen que apoyar sobre un paño entero de vigas contra cada borde.",
        acciones:[{ label:"Acomodar el vano", run(){ p.vano = encajarVano(p, p.vano).vano; } }] });
  }
  return cards;
}
let _solCards = [];
function avisosHTML(metadatos){
  _solCards = solucionesDe(metadatos);
  const cards = _solCards.map((c, i) => `<div class="solcard ${c.tono}">
    <b>${c.tono === "error" ? "⛔" : "⚠"} ${c.titulo}</b>
    <span class="solwhy">${c.porque}</span>
    <div class="solacts">${c.acciones.map((a, j) => `<button type="button" class="btn sm" data-sol="${i}:${j}">${a.label}</button>`).join("")}</div>
  </div>`).join("");
  const info = (titulo, arr) => arr?.length
    ? `<div class="avisos"><b>${titulo}</b>${arr.map(a => `<span>${a}</span>`).join("")}</div>` : "";
  return cards
    + info("✓ Lo acomodé", metadatos?.ajustes)
    + info("ℹ Para tener en cuenta", metadatos?.notas);
}
// Cablea los botones "Aplicar solución": corren el fix (muta params) y regeneran todo.
function wireSoluciones(root){
  (root || document).querySelectorAll("[data-sol]").forEach(b => b.onclick = () => {
    const [i, j] = b.dataset.sol.split(":").map(Number);
    const acc = _solCards[i]?.acciones?.[j]; if (!acc) return;
    acc.run(); render();
  });
}
function shoppingList(mat){
  const items = [];
  mat.perfiles.forEach(p => items.push({ key:`perf:${p.perfil}`, label:p.perfil, unidad:unidadBarra(p.largoBarra), cant:p.barras }));
  if (mat.tornillos?.t1) items.push({ key:"t1", label:"Tornillo T1 (estructura)", unidad:"u", cant:mat.tornillos.t1 });
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
    <p class="sub">Perfilería en barras comerciales (6 m steel · 3,05 m wood). Cargá el precio de tu corralón — se guarda en este navegador. Sólo estructura.</p>
  </form>`;
  const recompute = () => {
    let total = 0;
    body.querySelectorAll(".pinput").forEach(inp => { const st = (+inp.dataset.cant) * parseNum(inp.value); total += st; inp.closest("tr").querySelector("[data-sub]").textContent = money(st); });
    body.querySelector("[data-total]").textContent = money(total);
  };
  body.querySelectorAll(".pinput").forEach(inp => inp.addEventListener("input", () => { setPrice(inp.dataset.key, parseNum(inp.value)); recompute(); }));
  recompute();
  wireSoluciones(body);
}

// ---------- cortes ----------
// Render de una sección del plan de corte (barras con sus piezas). Sólo con licencia (viene del server).
function seccionPlan(pl){
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
}
// Muro de valor: los AGREGADOS (barras, ahorro, desperdicio) los calcula el servidor y se ven SIEMPRE;
// la lista detallada sólo llega con licencia. Sin licencia se muestra difuminada (preview de 3 barras).
async function renderCortes(body){
  const input = toEngineInput();
  const metadatos = computeProject(input).metadatos;
  body.innerHTML = `<div class="pane">${avisosHTML(metadatos)}<p class="sub">Calculando la optimización…</p></div>`;
  let d;
  try { d = await fetchCortes(input, loadPrices()); }
  catch (e) { body.innerHTML = `<div class="pane">${avisosHTML(metadatos)}<p class="warn">No se pudo calcular: ${e.message}</p></div>`; return; }
  const a = d.agregados;
  const pesos = a.ahorroPesos > 0 ? ` · ahorrás <b>${money(a.ahorroPesos)}</b> con tus precios` : "";
  const resumen = a.barrasOpt ? `<div class="ahorro">
    <div class="ahtit">Con optimización: <b>${a.barrasOpt} barras</b> en vez de ${a.barrasNaive}.</div>
    <div class="ahsub">Ahorrás <b>${a.ahorroBarras} barra${a.ahorroBarras!==1?"s":""}</b> y bajás el desperdicio del ${a.desperdicioNaive}% al ${a.desperdicioOpt}%${pesos}.</div>
  </div>` : "";
  if (d.licenciado){
    const secciones = (d.plan || []).map(seccionPlan).join("");
    body.innerHTML = `<div class="pane">${avisosHTML(metadatos)}${resumen}${secciones || `<p class="sub">Sin piezas.</p>`}
      <p class="sub">Cada etiqueta es <b>código·largo(mm)</b>. Optimización First-Fit, sin descontar merma de sierra.</p></div>`;
    wireSoluciones(body); return;
  }
  // Sin licencia: 2-3 barras reales + relleno difuminado (la forma se ve; no se puede usar).
  const reales = (d.preview || []).map(b => `<div class="bin"><span class="binno">Barra</span>
    <span class="binitems">${b.items.map(it => `<i>${it.code}·${it.largo}</i>`).join("")}</span>
    <span class="binrem">sobra ${b.rem} mm</span></div>`).join("");
  const falsas = Array.from({ length: 5 }, () => `<div class="bin blur"><span class="binno">Barra</span>
    <span class="binitems"><i>••·••••</i><i>••·••••</i><i>••·••••</i></span><span class="binrem">sobra ••• mm</span></div>`).join("");
  const ocultas = Math.max(0, (d.totalBarras || 0) - (d.preview || []).length);
  const masLabel = ocultas ? `<div class="binmore">+ ${ocultas} barra${ocultas !== 1 ? "s" : ""} más con el detalle completo</div>` : "";
  body.innerHTML = `<div class="pane">${avisosHTML(metadatos)}${resumen}
    <div class="cutgrp"><div class="cuthead"><b>Lista de cortes por barra</b><span>${d.totalBarras} barras</span></div>
      ${reales}${falsas}${masLabel}
      <div class="gatemsg"><p>La lista detallada — qué corte sale de qué barra y en qué orden — viene con el proyecto desbloqueado.</p>
      <button class="btn" id="gate-pagar">Ver planes</button></div></div></div>`;
  document.getElementById("gate-pagar").onclick = () => { state.tab = "pdf"; renderTab(); };
  wireSoluciones(body);
}

// ---------- export ----------
// Snapshot del 3D para el PDF (el WebGL solo existe en el navegador; el backend recibe la imagen).
function capture3D(piezas, metadatos = {}){
  if (!ViewerClass) return null; // visor no cargado: el PDF se genera igual server-side, sin la imagen 3D
  const div = document.createElement("div");
  div.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;height:560px;";
  document.body.appendChild(div);
  let url = null;
  const vista = metadatos.vistaDefault || metadatos.vistas?.[0]?.id
    || (metadatos.esquema === "planta" ? "planta" : "frontal");
  try { const v = new ViewerClass(div, { snapshot: true }); v.setPieces(piezas, { vista, elevacion: metadatos.elevacion || 0 }); v.resize(); url = v.toDataURL(); v.dispose(); }
  catch (e) { console.warn("snapshot 3D falló", e); }
  div.remove();
  return url;
}

// Dos tarjetas de compra (proyecto suelto · pase de obra recomendado). Copy orientado a resultado.
function pagoHTML(){
  return `<div class="planes">
    <div class="plan">
      <h4>${PRICING.skus.proyecto.label}</h4>
      <div class="planprice">${money(precioSku("proyecto"))}</div>
      <p>Un proyecto, con todas las ediciones que necesites. Tuyo para siempre.</p>
      <button class="btn ghost" data-sku="proyecto">Comprar proyecto</button>
    </div>
    <div class="plan destacado">
      <span class="planrec">RECOMENDADO</span>
      <h4>${PRICING.skus.pase90.label}</h4>
      <div class="planprice">${money(precioSku("pase90"))}</div>
      <p>Todos los proyectos que quieras durante 90 días. Lo que armes queda tuyo para siempre, aunque venza el pase.</p>
      <button class="btn" data-sku="pase90">Comprar pase de obra</button>
    </div>
  </div>
  <p class="planlegal">No es suscripción. Se paga una vez y no se renueva solo.</p>`;
}
function wirePago(root, msg){
  root.querySelectorAll("[data-sku]").forEach(b => b.onclick = () => {
    if (msg) msg.textContent = "Abriendo Mercado Pago…";
    guardarProyecto();
    iniciarPago(b.dataset.sku).catch(e => { if (msg) msg.textContent = "Error: " + e.message; else alert(e.message); });
  });
}
const RENOV_KEY = "adamant_renov_ofrecido";

// Captura de lead + pago manual (primeros usuarios): guardar el proyecto por WhatsApp (nos llega el
// contacto con el proyecto), y transferencia al alias con comprobante por WhatsApp (habilitación a mano).
function extrasCompraHTML(){
  const resumen = resumenProyecto(), ph = getProyId();
  const lead = wppLink(`Hola! Armé este proyecto en Adamant (${resumen}) y quiero guardarlo. Link: ${linkProyecto()}`);
  const transf = wppLink(`Hola! Voy a transferir al alias ${ALIAS_MP} por Adamant. Te paso el comprobante. Mi código de proyecto: ${ph}`);
  return `
    <div class="expsep">Guardalo para después</div>
    <a class="btn ghost" href="${lead}" target="_blank" rel="noopener">📲 Guardá este proyecto por WhatsApp</a>
    <p class="expnote">Te llega un link que reabre estas mismas medidas cuando quieras seguir.</p>
    <div class="expsep">o pagá por transferencia</div>
    <p class="sub" style="max-width:340px">Alias Personal Pay <b>${ALIAS_MP}</b>. Transferí y mandanos el comprobante por WhatsApp; te habilitamos en minutos con un código.</p>
    <a class="btn ghost" href="${transf}" target="_blank" rel="noopener">📲 Enviar comprobante por WhatsApp</a>
    <p class="expnote">Tu código de proyecto: <code>${ph}</code> — va en el mensaje, lo necesitamos para habilitarte.</p>`;
}

function renderExport(body){
  if (!autorizado()){
    body.innerHTML = `<div class="pane center">
      <p class="sub"><b>Desbloqueá el PDF de obra y la lista de cortes detallada.</b> Elegí cómo:</p>
      ${pagoHTML()}
      ${extrasCompraHTML()}
      <p class="expmsg" id="expmsg"></p></div>`;
    wirePago(body, document.getElementById("expmsg"));
    return;
  }
  const est = estadoLicencia();
  const dias = est.dias;
  const estado = est.tipo === "pase"
    ? `Pase activo ✓ (${dias} día${dias!==1?"s":""} restantes). Proyectos ilimitados.`
    : "Proyecto desbloqueado ✓ — tuyo para siempre.";
  // Renovación: a ≤15 días del vencimiento, se ofrece UNA vez el renov (no se insiste después).
  let renov = "";
  if (est.tipo === "pase" && dias <= 15 && !localStorage.getItem(RENOV_KEY)){
    try { localStorage.setItem(RENOV_KEY, "1"); } catch {}
    renov = `<div class="renov"><p>Tu pase vence pronto. Si querés seguir con proyectos ilimitados, podés renovarlo por ${money(precioSku("pase90_renov"))} (90 días más).</p>
      <button class="btn" data-sku="pase90_renov">Renovar pase</button></div>`;
  }
  body.innerHTML = `<div class="pane center">
    <p class="sub">${estado} Descargá el PDF de obra completo (resumen, 3D, esquema acotado, lista de compra y cortes optimizados).</p>
    <button class="btn" id="dlpdf">🧾 Descargar PDF de obra</button>
    ${renov}
    <div class="expsep">Otro proyecto</div>
    <button class="btn ghost" id="nuevoproy">✚ Empezar un proyecto nuevo</button>
    <p class="expnote">${est.tipo === "pase" ? "Con el pase, empezar otro proyecto no cuesta nada." : "El desbloqueo vale para <b>este</b> proyecto. Con un pase de obra hacés todos los que quieras."}</p>
    <p class="expmsg" id="expmsg"></p></div>`;
  const msg = document.getElementById("expmsg");
  const fallo = e => { msg.textContent = "Error: " + (e.message || e); console.error(e); };
  if (renov) wirePago(body.querySelector(".renov"), msg);
  document.getElementById("nuevoproy").onclick = () => {
    const conPase = estadoLicencia().tipo === "pase";
    const aviso = conPase
      ? "Vas a empezar un proyecto nuevo. El pase te lo cubre igual.\n\nEl actual queda cerrado: si querés volver a bajar su PDF, hacelo ahora.\n\n¿Seguir?"
      : "Vas a empezar un proyecto nuevo, que hay que desbloquear con otro pago.\n\nEl actual queda cerrado: si querés volver a bajar su PDF, hacelo ahora.\n\n¿Seguir?";
    if (!confirm(aviso)) return;
    nuevoProyecto();
    borrarProyectoGuardado();
    state.kind = null; state.step = 0; state.params = null;
    state.vista3d = null; state.parte3d = "todo"; state.capas = {}; state.muroSel = null; state.tab = "3d";
    render();
  };
  document.getElementById("dlpdf").onclick = async () => {
    msg.textContent = "Generando PDF…";
    try {
      await cargarVisor(); // asegura el visor para el snapshot 3D del PDF (aunque no se haya abierto la solapa 3D)
      const input = toEngineInput();
      const { piezas, metadatos } = computeProject(input);
      const img = capture3D(piezas.filter(p => !p.superficie), metadatos);
      const blob = await generarPDF(input, { img, precios: loadPrices() });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `adamant-${state.kind}-${state.params.sistema}.pdf`; a.click(); URL.revokeObjectURL(a.href);
      msg.textContent = "✓ PDF descargado";
    } catch (e) { fallo(e); }
  };
}
