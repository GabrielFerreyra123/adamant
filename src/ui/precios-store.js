// ADAMANT · persistencia de la lista de precios (única para todos los módulos).
// Capa FINA: acá vive el localStorage; el cálculo del presupuesto es puro y vive en engine/precios.mjs.
// Guardamos SÓLO { precio, actualizado } por id; el nombre/categoría/unidad salen del catálogo, así
// agregar ítems en versiones futuras no rompe lo ya cargado.
import { CATALOGO, CAT_POR_ID, idDePerfil, idDePlaca, normalizar } from "../engine/catalogo.mjs";

const KEY = "adamant.precios.v1";
const KEY_VIEJA = "adamant_precios";   // esquema por módulo (se migra y NO se borra: rollback barato)

const leer = k => { try { return JSON.parse(localStorage.getItem(k)) || null; } catch { return null; } };
const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// { [id]: { precio, actualizado } }
export function cargarPrecios(){ return leer(KEY)?.items || {}; }

export function setPrecio(id, precio){
  const st = leer(KEY) || { v: 1, items: {} };
  const p = +precio || 0;
  if (p > 0) st.items[id] = { precio: p, actualizado: new Date().toISOString() };
  else delete st.items[id];           // borrar el precio = volver a "sin precio", no a cero
  escribir(KEY, st);
  return st.items;
}

// --- migración desde el esquema viejo (claves por módulo) -------------------------------------
// Mapea la clave vieja al id del catálogo. Las que ya eran ids estables (fleje-rollo, tensor,
// carp-*, banda-estanca…) se mantienen igual.
export function idDesdeClaveVieja(k){
  if (!k) return null;
  if (k.startsWith("perf:")) return idDePerfil(k.slice(5));
  if (k.startsWith("placa:")) return idDePlaca(k.slice(6));
  const fijas = { t1: "tornillo-t1", t2: "tornillo-t2", aislacion: "aislacion-lana", "placa-piso": "placa-piso-osb-18" };
  if (fijas[k]) return fijas[k];
  if (CAT_POR_ID[k]) return k;
  // último recurso: match por nombre normalizado contra el catálogo
  const n = normalizar(k);
  return CATALOGO.find(i => normalizar(i.nombre) === n || normalizar(i.id) === n)?.id || null;
}

// Idempotente: sólo completa ids que TODAVÍA no tienen precio en el store nuevo, así una segunda
// corrida no duplica ni pisa ediciones posteriores. No borra la clave vieja.
export function migrarPrecios(){
  const viejo = leer(KEY_VIEJA);
  const st = leer(KEY) || { v: 1, items: {} };
  if (!viejo || typeof viejo !== "object") { if (!leer(KEY)) escribir(KEY, st); return { migrados: 0, saltados: 0 }; }
  let migrados = 0, saltados = 0;
  Object.entries(viejo).forEach(([k, val]) => {
    const precio = +val || 0;
    const id = idDesdeClaveVieja(k);
    if (!id || !(precio > 0)) { saltados++; return; }
    if (st.items[id]) { saltados++; return; }         // ya cargado/editado: no se pisa
    st.items[id] = { precio, actualizado: st.migradoEn || new Date().toISOString() };
    migrados++;
  });
  st.migrado = true;
  st.migradoEn = st.migradoEn || new Date().toISOString();
  escribir(KEY, st);
  return { migrados, saltados };
}

// --- backup manual (la app corre offline: no hay sync) ----------------------------------------
export function exportarPrecios(){
  const items = cargarPrecios();
  return JSON.stringify({ app: "adamant", v: 1, exportado: new Date().toISOString(), items }, null, 2);
}
// Acepta el JSON exportado o un mapa plano { id: precio }. Devuelve cuántos entraron.
export function importarPrecios(texto){
  let data; try { data = JSON.parse(texto); } catch { return { ok: false, error: "El archivo no es un JSON válido." }; }
  const items = data?.items && typeof data.items === "object" ? data.items : data;
  if (!items || typeof items !== "object") return { ok: false, error: "El archivo no tiene una lista de precios." };
  const st = leer(KEY) || { v: 1, items: {} };
  let n = 0;
  Object.entries(items).forEach(([id, val]) => {
    const precio = +(typeof val === "object" && val !== null ? val.precio : val) || 0;
    if (!CAT_POR_ID[id] || !(precio > 0)) return;
    st.items[id] = { precio, actualizado: (typeof val === "object" && val?.actualizado) || new Date().toISOString() };
    n++;
  });
  escribir(KEY, st);
  return { ok: true, n };
}
