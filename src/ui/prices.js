// ADAMANT · esquema VIEJO de precios (una clave por módulo/material). LEGADO: la lista única vive en
// `src/ui/precios-store.js` (clave `adamant.precios.v1`) y el cálculo en `src/engine/precios.mjs`.
// Se conserva a propósito: `migrarPrecios()` lee esta clave y NO la borra, para poder volver atrás.
// Del archivo sólo se sigue usando `money`; el resto es la ruta de rollback — no borrar todavía.
const KEY = "adamant_precios";

export function loadPrices(){
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
export function getPrice(k){ return loadPrices()[k] ?? 0; }
export function setPrice(k, v){
  const p = loadPrices(); p[k] = +v || 0;
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
}
export const money = n => "$ " + Math.round(n || 0).toLocaleString("es-AR");
