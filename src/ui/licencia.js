// ADAMANT · licencias (cliente). Dos SKU: `pase90` (proyectos ilimitados 90 días) y `proyecto`
// (uno suelto, perpetuo). El token firmado lo emite el backend tras verificar el pago en Mercado Pago;
// acá sólo se guarda, se muestra su estado y se adjunta a /api/generar y /api/cortes.
//
// Autorización de un export: hay pase vigente (sirve para cualquier proyecto) O el proyecto tiene un
// token perpetuo. Lo generado con un pase queda perpetuo: el backend devuelve ese token y se guarda acá.
const PASE = "adamant_pase";          // { token, exp, sku } — el pase de obra vigente
const PERP = "adamant_perpetuos";     // { [projectHash]: token } — proyectos perpetuos
const PKEY = "adamant_proyecto";      // id (projectHash) del proyecto en curso

const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + Math.random().toString(36))
  .replace(/[^a-z0-9]/gi, "").slice(0, 24);

export function getProyId(){
  try { let p = localStorage.getItem(PKEY); if (!p){ p = nuevoId(); localStorage.setItem(PKEY, p); } return p; }
  catch { return "sinstorage"; }
}
const setProyId = p => { try { localStorage.setItem(PKEY, p); } catch {} };
export function nuevoProyecto(){ const p = nuevoId(); try { localStorage.setItem(PKEY, p); } catch {} return p; }

const leerJSON = k => { try { return JSON.parse(localStorage.getItem(k)) || null; } catch { return null; } };
const guardarJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// Lee el payload del token SIN verificar firma (para mostrar estado; la validación real es server-side).
function leerPayload(token){
  try {
    let p = String(token).split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    while (p.length % 4) p += "=";
    return JSON.parse(atob(p));
  } catch { return null; }
}

// --- estado ---
export function getPase(){ const p = leerJSON(PASE); return p?.token && p.exp && p.exp > Date.now() ? p : null; }
export function diasRestantes(){ const p = getPase(); return p ? Math.max(0, Math.ceil((p.exp - Date.now()) / 864e5)) : 0; }
const perpDe = ph => (leerJSON(PERP) || {})[ph] || null;
export function tokenPara(ph = getProyId()){ const pase = getPase(); return pase ? pase.token : perpDe(ph); }
export function autorizado(ph = getProyId()){ return !!tokenPara(ph); }

// Estado para el header/UI. → { tipo:'pase'|'proyecto'|'ninguno', dias, sku }
export function estadoLicencia(ph = getProyId()){
  const pase = getPase();
  if (pase) return { tipo: "pase", dias: diasRestantes(), sku: pase.sku || "pase90" };
  if (perpDe(ph)) return { tipo: "proyecto", dias: 0, sku: "proyecto" };
  return { tipo: "ninguno", dias: 0 };
}

// Guarda lo que devuelve /api/canjear o /api/recuperar. Pase → PASE; proyecto → PERP[projectHash].
function guardarLicencia({ token, exp, sku, projectHash }){
  if (!token) return;
  if (sku === "proyecto"){
    const ph = projectHash || getProyId();
    const m = leerJSON(PERP) || {}; m[ph] = token; guardarJSON(PERP, m);
    if (projectHash) setProyId(projectHash); // adoptar el proyecto recuperado como el activo
  } else { guardarJSON(PASE, { token, exp, sku: sku || "pase90" }); }
}
// Perpetuo emitido por el backend al generar con el pase (header X-Adamant-Perpetuo).
export function guardarPerpetuo(ph, token){ if (!token) return; const m = leerJSON(PERP) || {}; m[ph] = token; guardarJSON(PERP, m); }

// Restaurar pegando el CÓDIGO (token). Se guarda; la firma la valida el backend al exportar.
export function restaurarPorCodigo(codigo){
  const token = String(codigo || "").trim();
  const d = leerPayload(token);
  if (!token.includes(".") || !d) throw new Error("El código no tiene el formato esperado");
  if (d.sku === "proyecto") guardarLicencia({ token, sku: "proyecto", projectHash: d.projectHash });
  else guardarLicencia({ token, exp: d.exp, sku: d.sku || "pase90" });
  return estadoLicencia();
}

// Restaurar desde el N° de operación de Mercado Pago (sin código).
export async function recuperarPorOperacion(operacion){
  const r = await fetch("/api/recuperar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operacion }) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "No se pudo recuperar");
  guardarLicencia(d);
  return d;
}

// --- compra ---
export async function iniciarPago(sku){
  const r = await fetch("/api/crear-pago", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sku, projectHash: sku === "proyecto" ? getProyId() : "" })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "No se pudo iniciar el pago");
  location.href = d.init_point;
}

// Al volver de MP la URL trae payment_id. Canjea por licencia y limpia la URL. → true si activó algo.
export async function canjearSiVuelve(){
  const q = new URLSearchParams(location.search);
  const pid = q.get("payment_id") || q.get("collection_id");
  if (!pid || pid === "null") return false;
  history.replaceState(null, "", location.pathname);
  try {
    const r = await fetch("/api/canjear", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payment_id: pid }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Canje rechazado");
    guardarLicencia(d);
    if (d.sku === "proyecto" && d.projectHash) setProyId(d.projectHash);
    return d;
  } catch (e) {
    console.warn("[licencia] canje falló:", e.message);
    alert("El pago no pudo verificarse: " + e.message + "\nSi el dinero se debitó, recuperá tu acceso con el N° de operación.");
    return false;
  }
}

// --- consumo con licencia ---
// Cortes: agregados siempre; lista detallada sólo si hay licencia (el backend decide).
export async function fetchCortes(input, precios = {}){
  const ph = getProyId();
  const r = await fetch("/api/cortes", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, precios, token: tokenPara(ph) || undefined, projectHash: ph })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "No se pudo calcular");
  if (d.perpetuo) guardarPerpetuo(ph, d.perpetuo); // lo generado con el pase queda perpetuo
  return d;
}

// PDF de obra (server-side; la pared de pago real).
export async function generarPDF(input, extras = {}){
  const ph = getProyId(), token = tokenPara(ph);
  if (!token) throw new Error("sin licencia");
  const r = await fetch("/api/generar", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, projectHash: ph, tipo: "pdf", input, ...extras })
  });
  if (!r.ok){ const d = await r.json().catch(() => ({})); throw new Error(d.error || `Error ${r.status}`); }
  const perp = r.headers.get("X-Adamant-Perpetuo");
  if (perp) guardarPerpetuo(ph, perp);
  return r.blob();
}

// DXF de despiece (server-side; misma pared de pago que el PDF). Para el proyectista/calculista.
export async function generarDXF(input){
  const ph = getProyId(), token = tokenPara(ph);
  if (!token) throw new Error("sin licencia");
  const r = await fetch("/api/generar", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, projectHash: ph, tipo: "dxf", input })
  });
  if (!r.ok){ const d = await r.json().catch(() => ({})); throw new Error(d.error || `Error ${r.status}`); }
  const perp = r.headers.get("X-Adamant-Perpetuo");
  if (perp) guardarPerpetuo(ph, perp);
  return r.blob();
}

// OBJ del modelo 3D (server-side; misma pared de pago). Para abrir en SketchUp / Blender / visores 3D.
export async function generarOBJ(input){
  const ph = getProyId(), token = tokenPara(ph);
  if (!token) throw new Error("sin licencia");
  const r = await fetch("/api/generar", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, projectHash: ph, tipo: "obj", input })
  });
  if (!r.ok){ const d = await r.json().catch(() => ({})); throw new Error(d.error || `Error ${r.status}`); }
  const perp = r.headers.get("X-Adamant-Perpetuo");
  if (perp) guardarPerpetuo(ph, perp);
  return r.blob();
}

// Dossier de cumplimiento (server-side; misma pared de pago). Para el profesional que revisa y firma.
// `clima` = { ciudad, zonaViento, nieve, zonaBio } (vive en el estado de la UI, no en el input del motor).
export async function generarDossier(input, clima){
  const ph = getProyId(), token = tokenPara(ph);
  if (!token) throw new Error("sin licencia");
  const r = await fetch("/api/generar", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, projectHash: ph, tipo: "dossier", input, clima: clima || {} })
  });
  if (!r.ok){ const d = await r.json().catch(() => ({})); throw new Error(d.error || `Error ${r.status}`); }
  const perp = r.headers.get("X-Adamant-Perpetuo");
  if (perp) guardarPerpetuo(ph, perp);
  return r.blob();
}
