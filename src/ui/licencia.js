// ADAMANT · licencia por proyecto (cliente). El token firmado lo emite /api/canjear tras verificar
// el pago en Mercado Pago; acá solo se guarda, se muestra su estado y se adjunta a /api/generar.
const KEY = "adamant_licencia";

export function getLicencia(){
  try {
    const l = JSON.parse(localStorage.getItem(KEY));
    if (l?.token && l.exp > Date.now()) return l;
  } catch {}
  return null;
}
const setLicencia = l => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch {} };

export function diasRestantes(){ const l = getLicencia(); return l ? Math.max(0, Math.ceil((l.exp - Date.now()) / 864e5)) : 0; }

// Redirige al Checkout Pro de Mercado Pago.
export async function iniciarPago(){
  const r = await fetch("/api/crear-pago", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "adamant-web" })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "No se pudo iniciar el pago");
  location.href = d.init_point;
}

// Al volver de MP la URL trae payment_id (o collection_id). Canjea por licencia y limpia la URL.
// Llamar una vez al arrancar la app. → true si acaba de activarse una licencia.
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
    setLicencia({ token: d.token, exp: d.exp });
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
  const lic = getLicencia();
  if (!lic) throw new Error("sin licencia");
  const r = await fetch("/api/generar", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: lic.token, tipo, input, ...extras })
  });
  if (!r.ok){
    const d = await r.json().catch(() => ({}));
    if (r.status === 402) try { localStorage.removeItem(KEY); } catch {}
    throw new Error(d.error || `Error ${r.status}`);
  }
  return tipo === "pdf" ? r.blob() : r.text();
}
