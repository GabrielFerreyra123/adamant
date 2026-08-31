// ADAMANT · Wizard (F6). Schema-driven: la pantalla 1 es una grilla de módulos constructivos
// (desde el registro del motor) y los pasos siguientes se autogeneran desde el `schema` del módulo.
// Agregar un tipo nuevo NO toca este archivo si usa sólo campos simples (sistema/medida/seg/cards/perfil).
import { computeProject, listModules, getModule } from "../engine/index.mjs";
import { cutList } from "../engine/cuts.mjs";
import { murosDelAmbiente } from "../engine/modules/combinado.mjs";
import { validarVanoPiso, encajarVano, zonaVano } from "../engine/modules/piso.mjs";
import { validarTecho } from "../engine/modules/techo.mjs";
import { predimensionar } from "../engine/predimensionado.mjs";
import { aislacion, AISLANTES, ESPESORES } from "../engine/aislacion.mjs";
import { CIUDADES, CIUDAD_ORDEN, climaDeCiudad, VIENTO_LBL, NIEVE_LBL, BIO_LBL } from "../engine/clima.mjs";
import { fasesDeObra } from "../engine/fases.mjs";
import { comparar } from "../engine/comparador.mjs";
import { TIPO_LABEL, colorHex } from "../viewer/palette.js";
import { secDims, pieceBoxEngine } from "../engine/geometry.mjs";
import { buildBraces } from "../engine/brace.mjs";
import { getPrice, setPrice, money, loadPrices } from "./prices.js";
import { precioRef, PRECIOS_REF, rubroDe, RUBROS_ORDEN } from "../config/precios-referencia.js";
import { estadoLicencia, autorizado, iniciarPago, generarPDF, generarDXF, generarOBJ, generarDossier, canjearSiVuelve, nuevoProyecto, getProyId, fetchCortes, restaurarPorCodigo, recuperarPorOperacion } from "./licencia.js";
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

const state = { kind: null, step: 0, params: null, adv: false, tab: "3d", vista3d: null, parte3d: "todo", capas: {}, muroSel: null, tabSel: null, drawMode: false, nivel: "pb", quePieza: false, editOpen: false };
// Sufijo del array de vanos según el nivel activo (PB = "", PA = "PA") en el ambiente con planta alta.
const nivelSuf = () => (state.kind === "combinado" && state.params?.plantaAlta && state.nivel === "pa") ? "PA" : "";
// Array de tabiques del nivel activo (PB → `tabiques`, PA → `tabiquesPA`).
function tabsArr(){ const k = nivelSuf() ? "tabiquesPA" : "tabiques"; return (state.params[k] = state.params[k] || []); }
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

// Editor todo-en-uno (en la vista de Resultado): _repintar3d actualiza el 3D en vivo (cámara quieta);
// _onEdit redirige los editores interactivos (aberturas) para que refresquen el resultado en lugar de
// navegar. Fuera del editor, _onEdit es null → los editores usan render() normal.
let _repintar3d = null, _onEdit = null;
const emitEdit = () => (_onEdit || render)();

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
const mapTabs = arr => (arr || []).map(t => ({ dir:t.dir, at:t.at, desde:t.desde, hasta:t.hasta, vanos:mapVanos(t.vanos) }));
// Genérico: pasa todos los params tal cual; transforma vanos al formato del motor. El combinado lleva
// un array de vanos por muro (vanoFrente/Fondo/Izq/Der).
function toEngineInput(){
  const p = state.params;
  if (state.kind === "combinado")
    return { ...p, kind: "combinado", opciones: { ...p.opciones },
      vanoFrente: mapVanos(p.vanoFrente), vanoFondo: mapVanos(p.vanoFondo), vanoIzq: mapVanos(p.vanoIzq), vanoDer: mapVanos(p.vanoDer),
      vanoFrentePA: mapVanos(p.vanoFrentePA), vanoFondoPA: mapVanos(p.vanoFondoPA), vanoIzqPA: mapVanos(p.vanoIzqPA), vanoDerPA: mapVanos(p.vanoDerPA),
      tabiques: mapTabs(p.tabiques), tabiquesPA: mapTabs(p.tabiquesPA) };
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
  // Atajo "D": activa/desactiva Dibujar pared cuando la planta del ambiente está visible.
  document.addEventListener("keydown", ev => {
    if (ev.key.toLowerCase() !== "d" || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (/^(input|textarea|select)$/i.test(document.activeElement?.tagName || "")) return;
    if (!document.getElementById("planta4")) return; // sólo con la planta interactiva a la vista
    ev.preventDefault(); state.drawMode = !state.drawMode; emitEdit();
  });
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
const WPP = "5492914631729";   // WhatsApp de Adamant: contacto y lead del proyecto
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
  const p = document.getElementById("prev"); if (p) p.onclick = () => { state.step--; state.muroSel = null; state.tabSel = null; render(); };
  const n = document.getElementById("next"); if (n) n.onclick = () => { state.step++; state.muroSel = null; state.tabSel = null; render(); };
  const e = document.getElementById("edit"); if (e) e.onclick = () => { state.step = 1; state.muroSel = null; state.tabSel = null; render(); };
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
  state.vista3d = null; state.parte3d = "todo"; state.capas = {}; state.muroSel = null; state.tabSel = null; state.tab = "3d";
  state.editOpen = true;             // preset/compartido abre con el editor a mano (tocar medidas al toque)
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
    if (state.kind !== b.dataset.id){ state.kind = b.dataset.id; state.params = structuredClone(getModule(state.kind).defaults()); state.vista3d = null; state.parte3d = "todo"; state.capas = {}; state.muroSel = null; state.tabSel = null; }
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
    const campo = findCampo(paso, k);
    if (campo && campo.onSet) campo.onSet(state.params, val);
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
  if (state.kind === "combinado" && state.tabSel != null){
    const t = tabsArr()[state.tabSel]; t.vanos = t.vanos || [];
    return { arr: t.vanos, largo: Math.max(200, (+t.hasta) - (+t.desde)), alto: +state.params.alto };
  }
  if (state.kind === "combinado" && state.muroSel){
    const key = "vano" + cap(state.muroSel) + nivelSuf();
    state.params[key] = state.params[key] || [];
    const m = murosDelAmbiente(state.params).find(x => x.parte === state.muroSel);
    return { arr: state.params[key], largo: m.largo, alto: +state.params.alto };
  }
  state.params.vanos = state.params.vanos || [];
  return { arr: state.params.vanos, largo: +state.params.largo, alto: +state.params.alto };
}
// Espesor del muro del ambiente derivado del largo del lateral (izq = ancho − 2·e).
function espesorAmb(){
  const izq = murosDelAmbiente(state.params).find(x => x.parte === "izq");
  return Math.max(50, Math.round((+state.params.ancho - (izq?.largo || +state.params.ancho)) / 2));
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
  arr.push(v); emitEdit();
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
  el.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { arr.splice(+b.dataset.del, 1); emitEdit(); });
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
  emitEdit();
}
function wireVanoPiso(){
  const add = document.getElementById("vpAdd");
  if (add){
    add.onclick = () => { const { corrida, luz } = pisoPlanta();
      ponerVano({ x: Math.round(corrida/2 - 300), y: Math.round(luz/2 - 300), ancho: 600, largo: 600 }); };
    return;
  }
  const del = document.getElementById("vpDel"); if (del) del.onclick = () => { state.params.vano = null; state.vanoAjustes = null; emitEdit(); };
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
  const pa = state.params.plantaAlta && state.nivel === "pa";
  if (state.tabSel != null){
    const t = tabsArr()[state.tabSel];
    return `<div class="muroedit"><button class="btn ghost sm" id="volverPlanta">← Planta</button>
      <b>${pa?"PA · ":""}Tabique ${state.tabSel+1} · ${((t.hasta-t.desde)/1000).toFixed(2)} m ${t.dir==="x"?"(horizontal)":"(vertical)"}</b></div>${vanosHTML()}`;
  }
  if (state.muroSel){
    const m = murosDelAmbiente(state.params).find(x => x.parte === state.muroSel);
    return `<div class="muroedit"><button class="btn ghost sm" id="volverPlanta">← Planta</button>
      <b>${pa?"PA · ":""}${m.l} · ${(m.largo/1000).toFixed(2)} m</b></div>${vanosHTML()}`;
  }
  const nivSwitch = state.params.plantaAlta ? `<div class="nivsw">
      <button class="nvb ${!pa?'on':''}" data-niv="pb">Planta baja</button>
      <button class="nvb ${pa?'on':''}" data-niv="pa">Planta alta</button></div>` : "";
  const n = tabsArr().length;
  const tools = `<div class="planttools">
      <button class="btn sm ${state.drawMode?'on':''}" id="drawWall">✏️ Dibujar pared <kbd>D</kbd></button>
      <span class="planthint">${state.drawMode
        ? `Arrastrá dentro ${pa?"de la planta alta":"del ambiente"} para trazar la pared (se endereza sola y muestra la medida).`
        : `Dibujá una pared${pa?" en la planta alta":""} (tecla D), o tocá una existente para editar sus aberturas.`}</span>
    </div>`;
  const tip = `<p class="sub planttip">${n ? "Arrastrá una pared para moverla · tirá de las puntas para acortarla · tocala para las aberturas · ✕ la quita." : "Tocá un muro para sus aberturas, o dibujá paredes internas."}</p>`;
  return `${nivSwitch}${tools}<div class="planta4" id="planta4"></div>${tip}`;
}
function wireMurosPlanta(){
  if (state.tabSel != null){
    document.getElementById("volverPlanta").onclick = () => { state.tabSel = null; emitEdit(); };
    wireVanos(); return;
  }
  if (state.muroSel){
    document.getElementById("volverPlanta").onclick = () => { state.muroSel = null; state.tabSel = null; emitEdit(); };
    wireVanos(); return;
  }
  document.querySelectorAll("[data-niv]").forEach(b => b.onclick = () => { state.nivel = b.dataset.niv; state.drawMode = false; emitEdit(); });
  const db = document.getElementById("drawWall");
  if (db) db.onclick = () => { state.drawMode = !state.drawMode; emitEdit(); };
  drawPlanta4();
}
function nVanosMuro(parte){ return (state.params["vano" + cap(parte) + nivelSuf()] || []).length; }
let _planDrag = null; // arrastre activo en la planta: {mode:'new'|'move'|'end'|'wtap', ...}
// Planta interactiva del ambiente: dibujar/mover/acortar paredes internas con el mouse.
function drawPlanta4(){
  const box = document.getElementById("planta4"); if (!box) return;
  const p = state.params, muros = murosDelAmbiente(p), largo = +p.largo, ancho = +p.ancho;
  const W = box.clientWidth || 340, H = Math.max(200, Math.min(340, W * ancho/largo)), t = 26;
  const e = espesorAmb(), GRID = 50;
  const pa = state.params.plantaAlta && state.nivel === "pa";
  const TB = tabsArr();                                   // tabiques del nivel activo (PB/PA)
  const sx = v => t + (v / largo) * (W - 2*t), sy = v => (H - t) - (v / ancho) * (H - 2*t);
  const snap = v => Math.round(v / GRID) * GRID, clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // Hueco de escalera (sólo en el plano de PA con escalera activa): se inicializa centrado y se edita
  // moviéndolo / redimensionándolo con el mouse. Coords del entramado (x sobre largo, y sobre ancho).
  const hole = pa && state.params.escalera
    ? (state.params.vanoEscalera || (state.params.vanoEscalera = {
        x: Math.round(clamp(largo/2 - 500, e, largo - e - 1000)), y: Math.round(clamp(ancho/2 - 1200, e, ancho - e - 2400)),
        ancho: Math.min(1000, largo - 2*e), largo: Math.min(2400, ancho - 2*e) }))
    : null;
  box.innerHTML = `<svg id="plantaSvg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="plantasvg ${state.drawMode?'drawing':''}"></svg>`;
  const svg = box.querySelector("#plantaSvg");
  // pantalla → mm (contempla escalado CSS del svg)
  const mm = ev => { const r = svg.getBoundingClientRect(); const px = (ev.clientX - r.left) * (W / r.width), py = (ev.clientY - r.top) * (H / r.height);
    return { px, py, x: (px - t) / (W - 2*t) * largo, y: ((H - t) - py) / (H - 2*t) * ancho }; };
  // Tolerancia de "imán" (≈14 px) en mm por eje, para pegar a otras paredes / al perímetro interior.
  const thX = 14 * largo / (W - 2*t), thY = 14 * ancho / (H - 2*t);
  const dentro = (v, a, b, tol) => v >= Math.min(a,b) - tol && v <= Math.max(a,b) + tol;
  // Pega un punto (mm) a cualquier tabique o a la cara interior del perímetro → permite arrancar/terminar
  // una pared perpendicular EN CUALQUIER punto de otra pared (encuentro en T).
  function snapWalls(x, y){
    (TB || []).forEach(tb => {
      if (tb.dir === "x"){ if (Math.abs(y - tb.at) < thY && dentro(x, tb.desde, tb.hasta, thX)) y = tb.at; }
      else { if (Math.abs(x - tb.at) < thX && dentro(y, tb.desde, tb.hasta, thY)) x = tb.at; }
    });
    [e, largo - e].forEach(v => { if (Math.abs(x - v) < thX) x = v; });
    [e, ancho - e].forEach(v => { if (Math.abs(y - v) < thY) y = v; });
    return { x, y };
  }
  // Pared nueva desde el arrastre: se endereza (H/V), ancla el eje al punto de INICIO y snapea a grilla.
  function newWall(d){
    const dx = Math.abs(d.x1 - d.x0), dy = Math.abs(d.y1 - d.y0);
    return dx >= dy
      ? { dir:"x", at: snap(clamp(d.y0, e, ancho-e)), desde: snap(clamp(Math.min(d.x0,d.x1), e, largo-e)), hasta: snap(clamp(Math.max(d.x0,d.x1), e, largo-e)) }
      : { dir:"y", at: snap(clamp(d.x0, e, largo-e)), desde: snap(clamp(Math.min(d.y0,d.y1), e, ancho-e)), hasta: snap(clamp(Math.max(d.y0,d.y1), e, ancho-e)) };
  }
  // Etiqueta de medida (mm) centrada sobre un segmento a..b (px).
  const medida = (a, b, val) => { const cx = (a[0]+b[0])/2, cy = (a[1]+b[1])/2, txt = `${Math.round(val)} mm`, w = txt.length*6.6 + 12;
    return `<g class="tabmed"><rect x="${(cx-w/2).toFixed(1)}" y="${(cy-9).toFixed(1)}" width="${w.toFixed(1)}" height="17" rx="4"/><text x="${cx.toFixed(1)}" y="${(cy+3.5).toFixed(1)}" text-anchor="middle">${txt}</text></g>`; };

  function paint(){
    const wall = (parte, x, y, w, h, tx, ty) => `<g class="wtap" data-parte="${parte}">
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/>
        <text x="${tx}" y="${ty}" text-anchor="middle">${muros.find(m=>m.parte===parte).l}${nVanosMuro(parte)?` (${nVanosMuro(parte)})`:""}</text></g>`;
    const tabs = (TB || []).map((tb, i) => {
      const horiz = tb.dir === "x";
      const a = horiz ? [sx(tb.desde), sy(tb.at)] : [sx(tb.at), sy(tb.desde)];
      const b = horiz ? [sx(tb.hasta), sy(tb.at)] : [sx(tb.at), sy(tb.hasta)];
      // puertas/ventanas como huecos (segmento del color del panel sobre la línea)
      const gaps = (tb.vanos || []).map(v => {
        const c1 = tb.desde + v.pos - v.ancho/2, c2 = tb.desde + v.pos + v.ancho/2;
        const p1 = horiz ? [sx(c1), sy(tb.at)] : [sx(tb.at), sy(c1)];
        const p2 = horiz ? [sx(c2), sy(tb.at)] : [sx(tb.at), sy(c2)];
        return `<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" class="tabgap"/>`;
      }).join("");
      const mid = [(a[0]+b[0])/2, (a[1]+b[1])/2];
      return `<g class="tabg" data-i="${i}">
        <line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="tabline"/>${gaps}
        <line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="tabhit tabbody" data-i="${i}"/>
        <circle cx="${a[0]}" cy="${a[1]}" r="6" class="tabend" data-i="${i}" data-end="0"/>
        <circle cx="${b[0]}" cy="${b[1]}" r="6" class="tabend" data-i="${i}" data-end="1"/>
        <g class="tabdel" data-i="${i}"><circle cx="${mid[0]}" cy="${mid[1]}" r="8"/><text x="${mid[0]}" y="${mid[1]+3.5}" text-anchor="middle">✕</text></g>
      </g>`;
    }).join("");
    let band = "";
    if (_planDrag && _planDrag.mode === "new"){
      const w = newWall(_planDrag);
      const a = w.dir === "x" ? [sx(w.desde), sy(w.at)] : [sx(w.at), sy(w.desde)];
      const b = w.dir === "x" ? [sx(w.hasta), sy(w.at)] : [sx(w.at), sy(w.hasta)];
      band = `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="tabline band"/>${medida(a, b, w.hasta - w.desde)}`;
    } else if (_planDrag && _planDrag.mode === "end"){
      const tb = TB[_planDrag.i];
      const a = tb.dir === "x" ? [sx(tb.desde), sy(tb.at)] : [sx(tb.at), sy(tb.desde)];
      const b = tb.dir === "x" ? [sx(tb.hasta), sy(tb.at)] : [sx(tb.at), sy(tb.hasta)];
      band = medida(a, b, tb.hasta - tb.desde);
    }
    let holeSVG = "";
    if (hole){
      const x1 = sx(hole.x), x2 = sx(hole.x + hole.ancho), yb = sy(hole.y), yt = sy(hole.y + hole.largo);
      const hs = [[hole.x, hole.y, 0, 0], [hole.x + hole.ancho, hole.y, 1, 0], [hole.x, hole.y + hole.largo, 0, 1], [hole.x + hole.ancho, hole.y + hole.largo, 1, 1]]
        .map(([mx, my, cx, cy]) => `<circle cx="${sx(mx).toFixed(1)}" cy="${sy(my).toFixed(1)}" r="6" class="holeh" data-cx="${cx}" data-cy="${cy}"/>`).join("");
      holeSVG = `<g class="holeg"><rect x="${x1.toFixed(1)}" y="${yt.toFixed(1)}" width="${(x2-x1).toFixed(1)}" height="${(yb-yt).toFixed(1)}" class="hole holebody"/>
        <text x="${((x1+x2)/2).toFixed(1)}" y="${((yt+yb)/2+4).toFixed(1)}" text-anchor="middle" class="holetxt">escalera ${Math.round(hole.ancho)}×${Math.round(hole.largo)}</text>${hs}</g>`;
    }
    svg.innerHTML = `<rect x="${t}" y="${t}" width="${W-2*t}" height="${H-2*t}" class="room"/>
      ${tabs}${holeSVG}${band}
      ${wall("fondo",  t, 0,     W-2*t, t, W/2, t-8)}
      ${wall("frente", t, H-t,   W-2*t, t, W/2, H-8)}
      ${wall("izq",    0, t,     t, H-2*t, 12, H/2)}
      ${wall("der",    W-t, t,   t, H-2*t, W-12, H/2)}
      ${(TB||[]).length?"":`<text x="${W/2}" y="${H/2}" text-anchor="middle" class="plantahint">${state.drawMode?"dibujá acá":"planta"}</text>`}`;
  }
  paint();

  svg.onpointerdown = ev => {
    const c = mm(ev);
    const del = ev.target.closest(".tabdel");
    if (del){ TB.splice(+del.dataset.i, 1); emitEdit(); return; }
    // Hueco de escalera (sólo PA): mover/redimensionar cuando NO estás dibujando pared.
    if (hole && !state.drawMode){
      const hr = ev.target.closest(".holeh");
      if (hr){ _planDrag = { mode:"holeR", cx:+hr.dataset.cx, cy:+hr.dataset.cy }; svg.setPointerCapture(ev.pointerId); return; }
      const hb = ev.target.closest(".holebody");
      if (hb){ _planDrag = { mode:"holeM", ox:hole.x, oy:hole.y, mx:c.x, my:c.y }; svg.setPointerCapture(ev.pointerId); return; }
    }
    // En modo dibujar, TODO el plano dibuja (las puntas/paredes no resizean): permite arrancar en una punta.
    if (state.drawMode){ const s = snapWalls(c.x, c.y); _planDrag = { mode:"new", x0:s.x, y0:s.y, x1:s.x, y1:s.y }; svg.setPointerCapture(ev.pointerId); return; }
    const end = ev.target.closest(".tabend");
    if (end){ _planDrag = { mode:"end", i:+end.dataset.i, end:+end.dataset.end }; svg.setPointerCapture(ev.pointerId); return; }
    const body = ev.target.closest(".tabbody");
    if (body){ _planDrag = { mode:"move", i:+body.dataset.i, px0:c.px, py0:c.py, moved:false }; svg.setPointerCapture(ev.pointerId); return; }
    const wt = ev.target.closest(".wtap");
    if (wt){ _planDrag = { mode:"wtap", parte:wt.dataset.parte, px0:c.px, py0:c.py, moved:false }; svg.setPointerCapture(ev.pointerId); }
  };
  svg.onpointermove = ev => {
    if (!_planDrag) return;
    const c = mm(ev), d = _planDrag;
    if (d.mode === "new"){ const s = snapWalls(c.x, c.y); d.x1 = s.x; d.y1 = s.y; paint(); return; }
    if (d.mode === "holeM"){
      hole.x = Math.round(clamp(snap(d.ox + (c.x - d.mx)), e, largo - e - hole.ancho));
      hole.y = Math.round(clamp(snap(d.oy + (c.y - d.my)), e, ancho - e - hole.largo)); paint(); return; }
    if (d.mode === "holeR"){
      const gx = snap(clamp(c.x, e, largo - e)), gy = snap(clamp(c.y, e, ancho - e));
      if (d.cx === 0){ const r = hole.x + hole.ancho; hole.x = Math.min(gx, r - 300); hole.ancho = r - hole.x; } else hole.ancho = Math.max(300, gx - hole.x);
      if (d.cy === 0){ const f = hole.y + hole.largo; hole.y = Math.min(gy, f - 300); hole.largo = f - hole.y; } else hole.largo = Math.max(300, gy - hole.y);
      paint(); return; }
    if (d.mode === "move" || d.mode === "wtap"){ if (Math.hypot(c.px-d.px0, c.py-d.py0) > 5) d.moved = true; }
    if (d.mode === "move"){ const tb = TB[d.i];
      tb.at = tb.dir === "x" ? snap(clamp(c.y, e, ancho-e)) : snap(clamp(c.x, e, largo-e)); paint(); return; }
    if (d.mode === "end"){ const tb = TB[d.i], horiz = tb.dir === "x";
      let val = horiz ? c.x : c.y;                       // snap del extremo a paredes perpendiculares que cruzan
      (TB || []).forEach((o, j) => { if (j === d.i) return;
        if (horiz && o.dir === "y" && Math.abs(val - o.at) < thX) val = o.at;
        if (!horiz && o.dir === "x" && Math.abs(val - o.at) < thY) val = o.at; });
      val = snap(clamp(val, e, (horiz ? largo : ancho) - e));
      if (d.end === 0) tb.desde = Math.min(val, tb.hasta - 100); else tb.hasta = Math.max(val, tb.desde + 100);
      paint(); return; }
  };
  svg.onpointerup = () => {
    const d = _planDrag; _planDrag = null; if (!d) return;
    if (d.mode === "new"){
      const w = newWall(d);
      if (w.hasta - w.desde >= 300){ TB.push({ ...w, vanos: [] }); state.drawMode = false; }
      emitEdit(); return;
    }
    if (d.mode === "move" && !d.moved){ state.tabSel = d.i; emitEdit(); return; }
    if (d.mode === "wtap" && !d.moved){ state.muroSel = d.parte; emitEdit(); return; }
    emitEdit();
  };
}

// ---------- paso resultado (común a todos los módulos) ----------
function stepResultado(){
  const tabs = [["3d","3D"],["mat","Materiales"],["guia","Guía"],["cut","Cortes"],["pdf","PDF"]];
  // Estado del chequeo → punto de color en la solapa Guía (se ve sin entrar).
  let chkPeor = null;
  try { chkPeor = predimensionar(toEngineInput(), { zona: state.zonaViento || "media", nieve: state.nieve || "baja" }).resumen.peor; } catch {}
  const tabHTML = ([k,l]) => `<button class="tab ${state.tab===k?'on':''}" data-tab="${k}">${
    k === "guia" && chkPeor ? `<span class="tabdot ${chkPeor}"></span>` : ""}${l}</button>`;
  const drawer = state.editOpen ? `<aside class="editpanel" id="editpanel">${editorHTML()}</aside>` : "";
  return `<div class="reswrap ${state.editOpen?'editing':''}">${drawer}
    <div class="result">
      <div class="resbar"><button class="btn ghost sm" id="toggleEdit">${state.editOpen?"✕ Cerrar edición":"✎ Editar proyecto"}</button>
        ${(state.kind==="muro"||state.kind==="combinado")?`<button class="btn ghost sm" id="planosBtn">🖨️ Planos por muro</button>`:""}</div>
      <div class="tabs">${tabs.map(tabHTML).join("")}</div>
      <div class="tabbody" id="tabbody"></div>
    </div></div>`;
}
function wireResultado(){
  const t = document.getElementById("toggleEdit"); if (t) t.onclick = () => { state.editOpen = !state.editOpen; render(); };
  const pl = document.getElementById("planosBtn"); if (pl) pl.onclick = abrirPlanos;
  if (state.editOpen) wireEditor();
  document.querySelectorAll(".tabs .tab").forEach(b => b.onclick = () => { state.tab = b.dataset.tab; renderTab(); });
  renderTab();
}

// --- editor todo-en-uno (drawer del resultado) ---
// Junta en un panel los campos simples de TODOS los pasos (medidas, sistema, perfil, techo, niveles).
// Los componentes interactivos (aberturas, vano de piso) abren su editor real en un modal.
function editorHTML(){
  const secs = pasosOf().map(paso => {
    if (paso.componente){
      const lbl = paso.componente === "vanoPiso" ? "Vano de piso…" : "Aberturas…";
      return `<div class="edgrp"><button class="btn ghost sm" data-editcomp="${paso.componente}">✎ ${lbl}</button></div>`;
    }
    const campos = [...(paso.campos || []), ...(paso.avanzado || [])].map(campoHTML).join("");
    return campos.trim() ? `<div class="edgrp"><h4>${paso.titulo}</h4>${campos}</div>` : "";
  }).join("");
  const il = state.kind === "combinado" ? `<div class="interlibre" id="interlibre">${interiorTxt()}</div>` : "";
  return `<div class="editinner"><b class="edttl">Editar proyecto</b>${secs}${il}</div>`;
}
function renderEditor(){ const el = document.getElementById("editpanel"); if (el){ el.innerHTML = editorHTML(); wireEditor(); } }
// Refresca el resultado. vivo=true → actualiza el 3D EN EL LUGAR (cámara quieta), para tipeo de medidas.
function refrescarResultado(vivo){
  if (vivo && state.tab === "3d" && viewer && _repintar3d) _repintar3d();
  else renderTab();
  const il = document.getElementById("interlibre"); if (il) il.innerHTML = interiorTxt();
}
function findCampoAny(k){ for (const p of pasosOf()){ const c = findCampo(p, k); if (c) return c; } return null; }
function wireEditor(){
  const root = document.getElementById("editpanel"); if (!root) return;
  root.querySelectorAll("[data-seg]").forEach(seg => seg.querySelectorAll("button").forEach(b => b.onclick = () => {
    const key = seg.dataset.seg, raw = b.dataset.v;
    const val = raw === "true" ? true : raw === "false" ? false : (isNaN(+raw) ? raw : +raw);
    if (key === "sistema"){ state.params.sistema = raw; renderEditor(); refrescarResultado(false); return; }
    const opt = key.startsWith("opt:"), k = opt ? key.slice(4) : key;
    if (opt) state.params.opciones[k] = val; else state.params[k] = val;
    renderEditor(); refrescarResultado(false);
  }));
  root.querySelectorAll("[data-cards]").forEach(cs => cs.querySelectorAll(".card").forEach(b => b.onclick = () => {
    const k = cs.dataset.cards, campo = findCampoAny(k);
    state.params[k] = b.dataset.v; if (campo && campo.onSet) campo.onSet(state.params, b.dataset.v);
    renderEditor(); refrescarResultado(false);
  }));
  root.querySelectorAll("[data-medida]").forEach(inp => {
    const recalc = debounce(() => refrescarResultado(true), 130); // tipeo: 3D en vivo, sin reencuadrar
    inp.oninput = () => { state.params[inp.dataset.medida] = Math.round(parseNum(inp.value) * 1000); recalc(); };
  });
  root.querySelectorAll("select[data-opt]").forEach(sel => sel.onchange = () => { state.params.opciones[sel.dataset.opt] = sel.value; refrescarResultado(false); });
  root.querySelectorAll("[data-editcomp]").forEach(b => b.onclick = () => abrirAberturasModal(b.dataset.editcomp));
}
// Editor interactivo de aberturas (o vano de piso) en un modal, reusando los componentes del wizard.
// Mientras está abierto, _onEdit hace que sus cambios refresquen el resultado en vivo (no navegan).
function abrirAberturasModal(compId){
  const ov = abrirModal(`<h3>${compId === "vanoPiso" ? "Vano de piso" : "Aberturas"}</h3><div class="modal-ab" id="modalAb"></div>`);
  const pintar = () => {
    const cont = document.getElementById("modalAb"); if (!cont) return;
    cont.innerHTML = compId === "murosPlanta" ? murosPlantaHTML() : compId === "vanoPiso" ? vanoPisoHTML() : vanosHTML();
    if (compId === "murosPlanta") wireMurosPlanta(); else if (compId === "vanoPiso") wireVanoPiso(); else wireVanos();
  };
  _onEdit = () => { pintar(); refrescarResultado(false); };  // los editores llaman emitEdit() → esto
  const cerrar = () => { _onEdit = null; state.muroSel = null; state.tabSel = null; cerrarModal(); refrescarResultado(false); };
  const x = document.getElementById("modalx"); if (x) x.onclick = cerrar;
  ov.addEventListener("click", e => { if (e.target === ov) cerrar(); });
  pintar();
}
function renderTab(){
  document.querySelectorAll(".tabs .tab").forEach(b => b.classList.toggle("on", b.dataset.tab === state.tab));
  const body = document.getElementById("tabbody");
  if (viewer){ viewer.dispose(); viewer = null; }
  _repintar3d = null;
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
      const mostrar = pz => (partes && state.parte3d !== "todo") ? pz.filter(p => p.parte === state.parte3d) : pz;
      const aplicarCapas = () => capas.forEach(c => { if (capaOn(c.id)) viewer.setLayerVisible(c.id, true); });
      viewer.setPieces(mostrar(piezas), { vista: state.vista3d, elevacion: metadatos.elevacion || 0 }); aplicarCapas();
      // Repintado EN VIVO (editor todo-en-uno): recomputa y actualiza la geometría sin mover la cámara.
      _repintar3d = () => { try { const r = computeProject(toEngineInput());
        viewer.setPieces(mostrar(r.piezas), { vista: state.vista3d, elevacion: r.metadatos.elevacion || 0, keepCamera: true }); aplicarCapas(); } catch (e) { console.warn("repintar3d", e && e.message); } };
      const ps = document.getElementById("partesel");
      if (ps) ps.querySelectorAll("button").forEach(b => b.onclick = () => {
        state.parte3d = b.dataset.p; ps.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
        viewer.setPieces(mostrar(piezas), { vista: state.vista3d, elevacion: metadatos.elevacion || 0 }); aplicarCapas();
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
  else if (state.tab === "guia"){ renderGuia(body); }
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
// Semáforo de pre-dimensionado (orientativo, NO cálculo). Zona de viento (la elige el usuario).
const ZONA_LBL = { baja: "Baja", media: "Media", alta: "Alta" };
// Ubicación → clima: elegir la ciudad autocompleta viento / nieve / zona bioambiental (state). El
// usuario igual puede ajustar el viento a mano (eso "desengancha" la ciudad).
function aplicarCiudad(id){
  const c = climaDeCiudad(id);
  state.ciudad = c ? id : "";
  if (c){ state.zonaViento = c.viento; state.nieve = c.nieve; state.zonaBio = c.bio; }
}
const SEM = { ok: "🟢", atencion: "🟡", fuera: "🔴" };
// Aplica un `fix` que devuelve el motor (predimensionado) sobre los parámetros del proyecto.
function aplicarFixChequeo(fix){
  const p = state.params;
  if (fix.tipo === "modulo") p.opciones = { ...p.opciones, modulo: fix.valor };
  else if (fix.tipo === "pendiente") p.pendiente = fix.valor;
  else if (fix.tipo === "arriostrar" || fix.tipo === "arriostrar-rigido"){
    const tipo = fix.tipo === "arriostrar-rigido" ? "diagonal" : "cruz";
    if (state.kind === "muro") p.arriostramiento = tipo;
    else { p.arriostre = tipo; ["Frente", "Fondo", "Izq", "Der"].forEach(l => p["arriostra" + l] = tipo); }
  } else if (fix.tipo === "seccion"){
    if (p.sistema === "wood") p.opciones = { ...p.opciones, lumber: fix.valor };
    else p.opciones = { ...p.opciones, pgc: fix.valor };
  }
  render();
}
let _chkFixes = [];
const AIS_UBIC = { continua: "Continua por fuera", entre: "Entre montantes" };
let _aisFixes = [];
// Chequeo unificado: VIENTO + FRÍO en una sola solapa, todo movido por la CIUDAD. Arriba, el semáforo
// estructural (viento/nieve/medidas); abajo, la aislación (frío) con su recomendación por zona bioambiental.
function renderChequeo(body){
  if (!state.zonaViento) state.zonaViento = "media";
  if (!state.aisl) state.aisl = { tipo: "Lana de vidrio", espesor: 100, ubicacion: "continua" };
  const { checks, resumen } = predimensionar(toEngineInput(), { zona: state.zonaViento, nieve: state.nieve || "baja" });
  _chkFixes = []; _aisFixes = [];
  const zonaSel = Object.keys(ZONA_LBL).map(z =>
    `<button class="zbtn ${state.zonaViento===z?'on':''}" data-zona="${z}">${ZONA_LBL[z]}</button>`).join("");
  // Selector de ciudad: autocompleta el clima. "" = elegir a mano.
  const ciudadOpts = `<option value="">Elegí tu ciudad…</option>` + CIUDAD_ORDEN.map(id =>
    `<option value="${id}" ${state.ciudad===id?"selected":""}>${CIUDADES[id].label}</option>`).join("");
  const c = climaDeCiudad(state.ciudad);
  const climaTxt = c ? `<p class="climaline">En <b>${c.label}</b>: ${VIENTO_LBL[c.viento]} · ${NIEVE_LBL[c.nieve]} · zona bioambiental ${BIO_LBL[c.bio]}. <span class="muted">Lo cargamos por vos; podés ajustarlo abajo.</span></p>` : "";
  const nMal = resumen.fuera, nRev = resumen.atencion;
  const resTxt = resumen.peor === "ok" ? "Se puede construir así."
    : resumen.peor === "atencion" ? `Ojo con ${nRev} cosa${nRev!==1?"s":""}: conviene revisarla${nRev!==1?"s":""}.`
    : `Frená: ${nMal} cosa${nMal!==1?"s":""} que necesita${nMal!==1?"n":""} un cálculo antes de construir.`;
  // Tarjetas en criollo (solo lo que no está 🟢, para no marear); si está todo bien, una tarjeta linda.
  const alertas = checks.filter(c => c.estado !== "ok");
  const cards = alertas.length ? alertas.map(c => {
    let btn = "";
    if (c.fix){ const i = _chkFixes.push(c.fix) - 1; btn = `<button type="button" class="btn sm" data-chkfix="${i}">${c.fix.label}</button>`; }
    return `<div class="chkcard ${c.estado}"><b>${SEM[c.estado]} ${c.titulo}</b>
      <span class="chkwhy">${c.detalle}</span>${btn ? `<div class="chkacts">${btn}</div>` : ""}</div>`;
  }).join("")
    : `<div class="chkcard ok"><b>🟢 Todo en rango</b><span class="chkwhy">Las medidas de tu proyecto entran dentro de lo típico de manual. Igual, el cálculo final lo firma un profesional.</span></div>`;
  // Detalle técnico (para el calculista): tabla plegable.
  const filas = checks.map(c => `<tr class="e-${c.estado}"><td>${SEM[c.estado]}</td><td>${c.label}</td>
    <td class="mono">${c.valor}</td><td class="chkrng">${c.rango}</td></tr>`).join("");
  const tecnico = checks.length ? `<details class="chktec"><summary>Ver los números</summary>
    <table class="chktable"><thead><tr><th></th><th>Ítem</th><th>Tu proyecto</th><th>Lo normal</th></tr></thead>
    <tbody>${filas}</tbody></table></details>` : "";

  // --- FRÍO / aislación (sólo muro/ambiente) --- misma solapa, movido por la zona bioambiental de la ciudad.
  const r = aislacion(toEngineInput(), { ...state.aisl, zonaBio: state.zonaBio });
  let frio = "";
  if (r.area > 0){
    const seg = (attr, items, sel) => items.map(([v, l]) =>
      `<button class="zbtn ${sel===v?'on':''}" data-${attr}="${v}">${l}</button>`).join("");
    const tipoSeg = seg("aistipo", Object.keys(AISLANTES).map(t => [t, t]), state.aisl.tipo);
    const espSeg = seg("aisesp", ESPESORES.map(e => [e, e + " mm"]), state.aisl.espesor);
    const ubicSeg = seg("aisubic", Object.entries(AIS_UBIC), state.aisl.ubicacion);
    const aisCards = r.avisos.map(a => {
      let btn = "";
      if (a.fix){ const i = _aisFixes.push(a.fix) - 1; btn = `<div class="chkacts"><button type="button" class="btn sm" data-aisfix="${i}">${a.fixLabel}</button></div>`; }
      const tono = a.tono === "info" ? "atencion" : a.tono;
      return `<div class="chkcard ${tono}"><b>${a.tono==="info"?"ℹ️":SEM[tono]||"⚠️"} ${a.titulo}</b><span class="chkwhy">${a.texto}</span>${btn}</div>`;
    }).join("");
    frio = `<div class="chksec">
      <h4 class="chksub">❄️ Frío y aislación <span class="chksubk ${r.estado}">${SEM[r.estado]} ${r.resumen}</span></h4>
      <p class="sub">Cuánto abriga tu muro (transmitancia K) y cuánto aislante comprar${state.ciudad?` en ${CIUDADES[state.ciudad].label}`:""}. La exigencia cambia con la zona: cuanto más frío, más aislación pide.</p>
      <div class="aisctrl">
        <div class="aisrow"><span class="zlbl">Aislante</span><div class="zbtns">${tipoSeg}</div></div>
        <div class="aisrow"><span class="zlbl">Espesor</span><div class="zbtns">${espSeg}</div></div>
        <div class="aisrow"><span class="zlbl">Dónde va</span><div class="zbtns">${ubicSeg}</div></div>
      </div>
      <div class="aisnums">
        <div class="aisk ${r.estado}"><b>${r.K.toFixed(2).replace(".",",")}</b><span>K (W/m²K)<br>recom. ≤ ${r.nivel.B.toFixed(2).replace(".",",")} (zona ${r.bio})</span></div>
        <div class="aisstat"><b>${r.m2} m²</b><span>de aislante a comprar</span></div>
        <div class="aisstat"><b>${r.area.toFixed(1).replace(".",",")} m²</b><span>de muro (neto)</span></div>
      </div>
      <div class="chklist">${aisCards}</div></div>`;
  }

  body.innerHTML = `<div class="pane">
    <div class="chkhead">
      <div><h3 class="chktitle">${SEM[resumen.peor]} ${resTxt}</h3>
        <p class="sub">Revisamos que tus medidas y tu clima entren dentro de lo normal antes de que compres o armes. Es orientativo.</p></div>
      <div class="zona">
        <span class="zlbl">¿Dónde construís?</span>
        <select class="ciudadsel" data-ciudad>${ciudadOpts}</select>
        <span class="zlbl zsub">¿Cuánto viento hay?</span><div class="zbtns">${zonaSel}</div>
      </div>
    </div>
    ${climaTxt}
    <div class="chksec"><h4 class="chksub">💨 Viento y estructura</h4>
      <div class="chklist">${cards}</div>${tecnico}</div>
    ${frio}
    <p class="chkdisc">⚠ Compara con valores típicos publicados (ConsulSteel · IRAM-IAS U 500-205 · IRAM 11601/11605 · manuales de wood frame). El clima por ciudad es orientativo (CIRSOC 102/104 · IRAM 11603). El <b>cálculo estructural, los arriostres, los anclajes y el proyecto higrotérmico los define un profesional habilitado</b>.</p>
  </div>`;
  body.querySelector("[data-ciudad]")?.addEventListener("change", e => { aplicarCiudad(e.target.value); renderChequeo(body); });
  // Ajustar el viento a mano desengancha la ciudad (el usuario manda).
  body.querySelectorAll("[data-zona]").forEach(b => b.onclick = () => { state.zonaViento = b.dataset.zona; state.ciudad = ""; renderChequeo(body); });
  body.querySelectorAll("[data-chkfix]").forEach(b => b.onclick = () => aplicarFixChequeo(_chkFixes[+b.dataset.chkfix]));
  body.querySelectorAll("[data-aistipo]").forEach(b => b.onclick = () => { state.aisl.tipo = b.dataset.aistipo; renderChequeo(body); });
  body.querySelectorAll("[data-aisesp]").forEach(b => b.onclick = () => { state.aisl.espesor = +b.dataset.aisesp; renderChequeo(body); });
  body.querySelectorAll("[data-aisubic]").forEach(b => b.onclick = () => { state.aisl.ubicacion = b.dataset.aisubic; renderChequeo(body); });
  body.querySelectorAll("[data-aisfix]").forEach(b => b.onclick = () => { Object.assign(state.aisl, _aisFixes[+b.dataset.aisfix]); renderChequeo(body); });
}
// Solapa "Guía": consolida los análisis (Chequeo · Aislación · Comparar · Fases) con sub-navegación.
function renderGuia(body){
  const esMuroAmb = state.kind === "muro" || state.kind === "combinado";
  // Chequeo ahora incluye viento + frío (aislación) en una sola solapa; ya no hay sub-tab "Aislación".
  const subs = [["chk", "Chequeo"]];
  if (esMuroAmb) subs.push(["cmp", "Comparar"]);
  subs.push(["fas", "Fases"]);
  if (!state.guiaSub || !subs.some(s => s[0] === state.guiaSub)) state.guiaSub = "chk";
  body.innerHTML = `<div class="guiawrap">
    <div class="guianav">${subs.map(([k, l]) =>
      `<button class="gbtn ${state.guiaSub===k?'on':''}" data-gsub="${k}">${l}</button>`).join("")}</div>
    <div class="guiabody" id="guiabody"></div></div>`;
  const gb = body.querySelector("#guiabody");
  ({ chk: renderChequeo, cmp: renderComparar, fas: renderFases }[state.guiaSub] || renderChequeo)(gb);
  body.querySelectorAll("[data-gsub]").forEach(b => b.onclick = () => { state.guiaSub = b.dataset.gsub; renderGuia(body); });
}
// ---- Planos por muro (láminas imprimibles para llevar a obra) ----
// Descompone el proyecto en muros individuales (elevación local de cada paño).
function murosParaLamina(input){
  if (input.kind === "muro") return [{ nombre: "Muro", input }];
  if (input.kind === "combinado"){
    const base = { kind: "muro", sistema: input.sistema, tipoMuro: "exterior", alto: input.alto, opciones: input.opciones };
    return [
      { nombre: "Frente",       input: { ...base, largo: +input.largo, vanos: input.vanoFrente || [], arriostramiento: input.arriostraFrente || "cruz" } },
      { nombre: "Fondo",        input: { ...base, largo: +input.largo, vanos: input.vanoFondo || [],  arriostramiento: input.arriostraFondo || "cruz" } },
      { nombre: "Lateral izq.", input: { ...base, largo: +input.ancho, vanos: input.vanoIzq || [],   arriostramiento: input.arriostraIzq || "cruz" } },
      { nombre: "Lateral der.", input: { ...base, largo: +input.ancho, vanos: input.vanoDer || [],   arriostramiento: input.arriostraDer || "cruz" } }
    ];
  }
  return [];
}
// Elevación acotada de un muro como SVG (montantes, vanos, soleras, cruces + cotas). Escala a ancho fijo.
function svgMuro(muroInput){
  const { piezas } = computeProject(muroInput);
  const L = +muroInput.largo, A = +muroInput.alto;
  if (!(L > 0 && A > 0)) return "";
  const W = 760, sc = W / L, H = A * sc, pad = 48;
  const col = t => /MONTANTE/.test(t) ? "#6b7d84"
    : /KING|JACK|DINTEL|CRIPPLE|CABEZAL|SOL\.VANO|SOL\.DINTEL/.test(t) ? "#e85d2a"
    : /SOL\.PANEL|SOLERA/.test(t) ? "#1bb6a4" : "#8aa0a8";
  let rects = "";
  (piezas || []).forEach(p => {
    if (p.superficie) return;
    const { size, center } = pieceBoxEngine(p), w = size[0] * sc, h = size[2] * sc;
    if (!(w > 0.2 && h > 0.2)) return;
    const x = pad + (center[0] - size[0] / 2) * sc, y = pad + H - (center[2] + size[2] / 2) * sc;
    rects += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${col(p.tipo)}" stroke="#0A1A22" stroke-width="0.4"/>`;
  });
  const braces = (buildBraces(muroInput).zonas || []).map(z => {
    const x0 = pad + z.x0 * sc, x1 = pad + (z.x0 + z.ancho) * sc, yb = pad + H, yt = pad + H - z.alto * sc;
    return `<line x1="${x0}" y1="${yb}" x2="${x1}" y2="${yt}" stroke="#6b7d84" stroke-width="1"/><line x1="${x0}" y1="${yt}" x2="${x1}" y2="${yb}" stroke="#6b7d84" stroke-width="1"/>`;
  }).join("");
  const vanos = (muroInput.vanos || []).map(v => {
    const cx = pad + ((+v.x1 + +v.x2) / 2) * sc, an = +v.x2 - +v.x1, al = +v.h - (+v.sill || 0);
    const cy = pad + H - ((+v.h + (+v.sill || 0)) / 2) * sc;
    return `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" font-size="11" fill="#0A1A22">${an}×${al}</text>`;
  }).join("");
  const cotas = `<line x1="${pad}" y1="${pad+H+18}" x2="${pad+W}" y2="${pad+H+18}" stroke="#1bb6a4"/>
    <text x="${pad+W/2}" y="${pad+H+33}" text-anchor="middle" font-size="12" fill="#5c7178">${(L/1000).toFixed(2)} m</text>
    <line x1="${pad-18}" y1="${pad}" x2="${pad-18}" y2="${pad+H}" stroke="#1bb6a4"/>
    <text x="${pad-26}" y="${pad+H/2}" text-anchor="middle" font-size="12" fill="#5c7178" transform="rotate(-90 ${pad-26} ${pad+H/2})">${(A/1000).toFixed(2)} m</text>`;
  return `<svg viewBox="0 0 ${W+pad*2} ${H+pad*2+24}" width="100%" xmlns="http://www.w3.org/2000/svg">${rects}${braces}${vanos}${cotas}</svg>`;
}
// Overlay imprimible: una lámina por muro (con @media print, una por página).
function abrirPlanos(){
  const muros = murosParaLamina(toEngineInput());
  if (!muros.length) return;
  const sheets = muros.map(m => `<div class="sheet">
    <h3>${m.nombre} · ${state.params.sistema === "wood" ? "Wood frame" : "Steel frame"} · modulación ${m.input.opciones?.modulo || 400} mm</h3>
    ${svgMuro(m.input)}
    <div class="sheetleg"><span><i style="background:#1bb6a4"></i>Solera</span><span><i style="background:#6b7d84"></i>Montante</span><span><i style="background:#e85d2a"></i>Vano (medidas en mm)</span></div>
  </div>`).join("");
  const ov = document.createElement("div");
  ov.className = "printsheets";
  ov.innerHTML = `<div class="printbar"><b>Planos por muro</b>
    <button class="btn sm" id="pimp">🖨️ Imprimir / PDF</button>
    <button class="btn ghost sm" id="pcerrar">Cerrar</button></div>
    <div class="sheets"><p class="sheetnote">Elevación acotada de cada muro para replantear en obra. Imprimí (o guardá como PDF): sale una hoja por muro.</p>${sheets}</div>`;
  document.body.appendChild(ov);
  ov.querySelector("#pcerrar").onclick = () => ov.remove();
  ov.querySelector("#pimp").onclick = () => window.print();
}
// Comparador de sistemas (steel · wood · tradicional): costo, tiempo y peso sobre la misma obra.
function renderComparar(body){
  const r = comparar(toEngineInput());
  if (!(r.area > 0)){ body.innerHTML = `<div class="pane"><p class="sub">El comparador cubre por ahora muros y ambientes.</p></div>`; return; }
  const card = (v, seco) => `<div class="cmpcard ${seco?'on':''}">
    <h4>${v.label}${seco?' <span class="cmptag">en seco</span>':''}</h4>
    <div class="cmpbig">${money(v.costoObra)}</div>
    <div class="cmpsubt">obra estimada · ${money(v.costoM2)}/m²</div>
    <div class="cmprow"><span>Tiempo</span><b>${v.dias} días</b></div>
    <div class="cmprow"><span>Peso estructura</span><b>${v.peso.toLocaleString("es-AR")} kg</b></div>
    ${v.estructura != null
      ? `<div class="cmprow"><span>Estructura (Adamant)</span><b>${money(v.estructura)}</b></div>`
      : `<div class="cmprow muted"><span>Estructura</span><b>otro sistema</b></div>`}
  </div>`;
  const cards = card(r.sistemas.steel, true) + card(r.sistemas.wood, true) + card(r.sistemas.tradicional, false);
  const dest = r.destacados.map(d => `<li>${d}</li>`).join("");
  body.innerHTML = `<div class="pane">
    <p class="sub">Tu obra de <b>${r.area.toFixed(1).replace(".",",")} m²</b> en tres sistemas. El <b>costo de estructura y el peso</b> de steel/wood los calcula Adamant; el costo de obra y el tiempo son estimación de mercado.</p>
    <div class="cmpgrid">${cards}</div>
    <ul class="cmpwin">${dest}</ul>
    <p class="chkdisc">⚠ Costo de obra y tiempo: estimación de mercado AR (a calibrar). La mampostería es referencia (Adamant calcula estructura en seco).</p>
  </div>`;
}
// Fases de obra: timeline de montaje derivado del modelo (qué va primero), para llevar a obra.
function renderFases(body){
  const { fases } = fasesDeObra(toEngineInput());
  if (!fases.length){ body.innerHTML = `<div class="pane"><p class="sub">Todavía no hay etapas para mostrar.</p></div>`; return; }
  const items = fases.map(f => `<div class="faseit">
    <div class="fasenum">${f.orden}</div>
    <div class="fasebody"><b>${f.titulo}</b><span class="fasenota">${f.nota}</span>
      <span class="fasepz">${f.piezas} pieza${f.piezas!==1?"s":""}</span></div>
  </div>`).join("");
  body.innerHTML = `<div class="pane">
    <p class="sub">El orden para armar en obra, de la fundación al cierre. Sale de tu propio modelo.</p>
    <div class="fases">${items}</div>
    <p class="chkdisc">Es la secuencia típica de montaje en seco (platform framing). Ajustala según tu obra y tu profesional.</p>
  </div>`;
}
function renderMateriales(body){
  const { materiales, metadatos } = computeProject(toEngineInput());
  const grupos = {};
  shoppingList(materiales).forEach(it => { (grupos[rubroDe(it.key)] = grupos[rubroDe(it.key)] || []).push(it); });
  const fila = it => {
    const sku = it.key.replace(/[^a-z0-9]+/gi, "-"), ref = precioRef(it.key), saved = getPrice(it.key);
    return `<tr><td>${it.label}</td><td class="u">${it.unidad}</td><td class="n">${it.cant}</td>
      <td class="n"><input class="pinput" type="text" inputmode="decimal" autocomplete="off" id="precio-unitario-${sku}" aria-label="Precio ${it.label}" data-key="${it.key}" data-cant="${it.cant}" data-ref="${ref}" value="${saved || ""}" placeholder="${ref || 0}"></td>
      <td class="n" data-sub></td></tr>`;
  };
  const cuerpo = RUBROS_ORDEN.filter(r => grupos[r]).map(r =>
    `<tbody data-rubro="${r}"><tr class="rubro"><td colspan="4">${r}</td><td class="n" data-rubrosub="${r}"></td></tr>${grupos[r].map(fila).join("")}</tbody>`).join("");
  body.innerHTML = `<form class="pane" autocomplete="off" onsubmit="return false">
    ${avisosHTML(metadatos)}
    <table class="mtable"><thead><tr><th>Material</th><th>Unidad</th><th class="n">Cant</th><th class="n">$ unit.</th><th class="n">Subtotal</th></tr></thead>
    ${cuerpo}
    <tfoot><tr><td colspan="4" class="n"><b>TOTAL estimado</b></td><td class="n"><b data-total></b></td></tr></tfoot></table>
    <p class="sub">Presupuesto <b>estimativo</b> con precios de referencia del mercado (${PRECIOS_REF.vigenteDesde}). El precio que cargues manda sobre el estimado y se guarda en este navegador. Sólo estructura.</p>
  </form>`;
  const recompute = () => {
    let total = 0; const subs = {};
    body.querySelectorAll(".pinput").forEach(inp => {
      const pu = parseNum(inp.value) || +inp.dataset.ref || 0, st = (+inp.dataset.cant) * pu;
      total += st; const r = inp.closest("tbody").dataset.rubro; subs[r] = (subs[r] || 0) + st;
      inp.closest("tr").querySelector("[data-sub]").textContent = money(st);
    });
    body.querySelectorAll("[data-rubrosub]").forEach(el => el.textContent = money(subs[el.dataset.rubrosub] || 0));
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
  <p class="planlegal">No es suscripción. Se paga una vez y no se renueva solo.<br>
    Al comprar aceptás los <a href="/legal#terminos" target="_blank" rel="noopener">términos</a> ·
    <a href="/legal#arrepentimiento" target="_blank" rel="noopener">botón de arrepentimiento</a> (10 días).</p>`;
}
function wirePago(root, msg){
  root.querySelectorAll("[data-sku]").forEach(b => b.onclick = () => {
    if (msg) msg.textContent = "Abriendo Mercado Pago…";
    guardarProyecto();
    iniciarPago(b.dataset.sku).catch(e => { if (msg) msg.textContent = "Error: " + e.message; else alert(e.message); });
  });
}
const RENOV_KEY = "adamant_renov_ofrecido";

// Captura de lead: guardar el proyecto por WhatsApp (nos llega el contacto con el proyecto adentro).
// El pago se cierra por Mercado Pago (automático); no hay flujo de transferencia manual en la UI.
function extrasCompraHTML(){
  const lead = wppLink(`Hola! Armé este proyecto en Adamant (${resumenProyecto()}) y quiero guardarlo. Link: ${linkProyecto()}`);
  return `
    <div class="expsep">Guardalo para después</div>
    <a class="btn ghost" href="${lead}" target="_blank" rel="noopener">📲 Guardá este proyecto por WhatsApp</a>
    <p class="expnote">Te llega un link que reabre estas mismas medidas cuando quieras seguir.</p>`;
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
    <button class="btn ghost" id="dldxf">📐 Descargar DXF para tu proyectista</button>
    <button class="btn ghost" id="dlobj">🧊 Descargar modelo 3D (OBJ)</button>
    <button class="btn ghost" id="dldossier">📋 Descargar dossier de cumplimiento</button>
    <p class="expnote">El DXF abre en AutoCAD/cualquier CAD (en mm) para que tu calculista verifique y selle. El OBJ es el modelo 3D para abrir en SketchUp, Blender o cualquier visor. El dossier de cumplimiento ordena los datos de sitio, el semáforo y los supuestos con un espacio de firma, para el profesional que lo revisa. Adamant arma la geometría; el cálculo estructural lo define un profesional habilitado.</p>
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
    state.vista3d = null; state.parte3d = "todo"; state.capas = {}; state.muroSel = null; state.tabSel = null; state.tab = "3d";
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
  document.getElementById("dldxf").onclick = async () => {
    msg.textContent = "Generando DXF…";
    try {
      const blob = await generarDXF(toEngineInput());
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `adamant-${state.kind}-${state.params.sistema}.dxf`; a.click(); URL.revokeObjectURL(a.href);
      msg.textContent = "✓ DXF descargado";
    } catch (e) { fallo(e); }
  };
  document.getElementById("dlobj").onclick = async () => {
    msg.textContent = "Generando modelo 3D…";
    try {
      const blob = await generarOBJ(toEngineInput());
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `adamant-${state.kind}-${state.params.sistema}.obj`; a.click(); URL.revokeObjectURL(a.href);
      msg.textContent = "✓ Modelo 3D (OBJ) descargado";
    } catch (e) { fallo(e); }
  };
  document.getElementById("dldossier").onclick = async () => {
    msg.textContent = "Generando dossier…";
    try {
      // El clima vive en el estado de la UI (Guía), no en el input del motor: se pasa aparte.
      const clima = { ciudad: state.ciudad, zonaViento: state.zonaViento, nieve: state.nieve, zonaBio: state.zonaBio };
      const blob = await generarDossier(toEngineInput(), clima);
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `adamant-dossier-${state.kind}-${state.params.sistema}.pdf`; a.click(); URL.revokeObjectURL(a.href);
      msg.textContent = "✓ Dossier descargado";
    } catch (e) { fallo(e); }
  };
}
