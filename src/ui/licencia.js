// ADAMANT · licencia POR PROYECTO (cliente). El token firmado lo emite /api/canjear tras verificar
// el pago en Mercado Pago; acá sólo se guarda, se muestra su estado y se adjunta a /api/generar.
//
// Un pago desbloquea UN proyecto: el navegador guarda un id de proyecto (`adamant_proyecto`) y las
// licencias van en un mapa proyecto→token. Editar el proyecto no cuesta nada (la licencia sigue
// valiendo mientras no venza); "Nuevo proyecto" mintea otro id y vuelve a pedir pago.
const KEY = "adamant_licencias";   // { [proy]: { token, exp } }
const PKEY = "adamant_proyecto";   // id del proyecto en curso

const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + Math.random().toString(36))
  .replace(/[^a-z0-9]/gi, "").slice(0, 24);

export function getProyId(){
  try {
    let p = localStorage.getItem(PKEY);
    if (!p){ p = nuevoId(); localStorage.setItem(PKEY, p); }
    return p;
  } catch { return "sinstorage"; }
}
const setProyId = p => { try { localStorage.setItem(PKEY, p); } catch {} };
// Empieza un proyecto nuevo (requiere pagarlo de nuevo). → nuevo id
export function nuevoProyecto(){
  const p = nuevoId();
  try { localStorage.setItem(PKEY, p); } catch {}
  return p;
}

const leerMapa = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const guardarMapa = m => { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch {} };

export function getLicencia(){
  const l = leerMapa()[getProyId()];
  return l?.token && l.exp > Date.now() ? l : null;
}
const setLicencia = (proy, l) => { const m = leerMapa(); m[proy] = l; guardarMapa(m); };
const borrarLicencia = proy => { const m = leerMapa(); delete m[proy]; guardarMapa(m); };

export function diasRestantes(){ const l = getLicencia(); return l ? Math.max(0, Math.ceil((l.exp - Date.now()) / 864e5)) : 0; }

// Redirige al Checkout Pro de Mercado Pago, atando el pago al proyecto en curso.
export async function iniciarPago(){
  const r = await fetch("/api/crear-pago", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proy: getProyId() })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "No se pudo iniciar el pago");
  location.href = d.init_point;
}

// Al volver de MP la URL trae payment_id (o collection_id). Canjea por licencia y limpia la URL.
// El servidor decide a qué proyecto queda atada (external_reference del pago). → true si se activó
// la licencia del proyecto en curso.
export async function canjearSiVuelve(){
  const q = new URLSearchParams(location.search);
  const pid = q.get("payment_id") || q.get("collection_id");
  if (!pid || pid === "null") return false;
  history.replaceState(null, "", location.pathname); // limpia siempre, aun si falla
  if (getLicencia()) return false;
  try {
    const r = await fetch("/api/canjear", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment_id: pid })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Canje rechazado");
    setLicencia(d.proy, { token: d.token, exp: d.exp });
    // El proyecto que se acaba de pagar pasa a ser el activo: así getLicencia() lo encuentra aunque
    // el id del navegador se hubiera desincronizado, y restaurarProyecto() repone SUS datos.
    setProyId(d.proy);
    return true;
  } catch (e) {
    console.warn("[licencia] canje falló:", e.message);
    alert("El pago no pudo verificarse: " + e.message + "\nSi el dinero se debitó, escribinos con tu número de operación.");
    return false;
  }
}

// Genera en el servidor (única vía: los generadores no viven en este bundle).
// tipo "pdf" → Blob; tipo "ruby" → string.
export async function generar(tipo, input, extras = {}){
  const proy = getProyId(), lic = getLicencia();
  if (!lic) throw new Error("sin licencia");
  const r = await fetch("/api/generar", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: lic.token, proy, tipo, input, ...extras })
  });
  if (!r.ok){
    const d = await r.json().catch(() => ({}));
    if (r.status === 402) borrarLicencia(proy);
    throw new Error(d.error || `Error ${r.status}`);
  }
  return tipo === "pdf" ? r.blob() : r.text();
}
