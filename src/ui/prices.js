// ADAMANT · precios unitarios editables, persistidos en localStorage (por clave de material).
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
