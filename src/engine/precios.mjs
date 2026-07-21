// ADAMANT · valorización. PURO: recibe cómputo + lista de precios y devuelve el presupuesto.
// No toca DOM ni localStorage (la persistencia vive en src/ui/precios-store.js), así corre igual en
// el navegador y en el backend que arma el PDF, y se testea en Node.
//
// Separación estricta: los MÓDULOS computan cantidades y no saben nada de precios. Acá se traduce el
// cómputo a ítems del catálogo (por id) y recién después se valoriza.
import { CAT_POR_ID, idDePerfil, idDePlaca } from "./catalogo.mjs";

const unidadBarra = len => `${len >= 6000 ? "barra" : "tira"} ${(len/1000).toFixed(2).replace(".", ",")} m`;

// Cómputo de un módulo (`materiales`) → ítems presupuestables con id del catálogo.
// Un ítem sin id de catálogo se emite igual con `id:null` para que el test 4 lo detecte (no se pierde
// en silencio) y el presupuesto lo muestre como "sin precio".
export function listaCompra(mat){
  const items = [];
  const push = (id, nombre, unidad, cantidad) => {
    if (!(cantidad > 0)) return;
    items.push({ id, nombre, unidad, cantidad, categoria: (id && CAT_POR_ID[id]?.categoria) || "accesorio" });
  };
  (mat.perfiles || []).forEach(p => push(idDePerfil(p.perfil), p.perfil, unidadBarra(p.largoBarra), p.barras));
  (mat.placas || []).forEach(p => push(idDePlaca(p.material), `Placa ${p.material} · ${p.cara}`, "placa 1,20×2,40", p.unidades));
  push("aislacion-lana", "Aislación (lana)", "m²", Math.ceil(mat.aislacion || 0));
  push("tornillo-t1", "Tornillo T1 (estructura)", "u", mat.tornillos?.t1);
  push("tornillo-t2", "Tornillo T2 (placa)", "u", mat.tornillos?.t2);
  // `otros` ya viene con una key estable por ítem (placa-piso, fleje-rollo, tensor, carp-*, …)
  (mat.otros || []).forEach(o => push(ID_OTROS[o.key] || o.key, o.label, o.unidad, o.cantidad));
  return items;
}
// Las keys de `otros` que no coinciden con el id del catálogo (el resto ya coincide).
const ID_OTROS = { "placa-piso": "placa-piso-osb-18" };

// Precio unitario de un id. Acepta el store nuevo ({id:{precio}}) y un mapa plano ({id:number}).
export const precioDe = (lista, id) => {
  const v = lista?.[id];
  return +(typeof v === "object" && v !== null ? v.precio : v) || 0;
};
const fechaDe = (lista, id) => (typeof lista?.[id] === "object" ? lista[id]?.actualizado : null) || null;

// Presupuesto: subtotales por categoría, total y flag `parcial`.
// Un ítem sin precio cargado NO suma 0 en silencio: se marca y el total queda "(parcial)".
export function resolverPresupuesto(items, lista = {}){
  const filas = (items || []).map(it => {
    const precio = it.id ? precioDe(lista, it.id) : 0;
    const sinPrecio = !(precio > 0);
    return { ...it, precio, sinPrecio, subtotal: sinPrecio ? 0 : precio * it.cantidad,
      actualizado: it.id ? fechaDe(lista, it.id) : null };
  });
  const categorias = {};
  filas.forEach(f => { if (!f.sinPrecio) categorias[f.categoria] = +( (categorias[f.categoria] || 0) + f.subtotal ).toFixed(2); });
  const sinPrecio = filas.filter(f => f.sinPrecio);
  const fechas = filas.filter(f => !f.sinPrecio && f.actualizado).map(f => f.actualizado).sort();
  return {
    filas, categorias,
    total: +filas.reduce((a, f) => a + f.subtotal, 0).toFixed(2),
    parcial: sinPrecio.length > 0,
    sinPrecio,
    masViejo: fechas[0] || null
  };
}

// Días desde la actualización más vieja usada (para el aviso de precios desactualizados).
export const DIAS_AVISO_PRECIOS = 60;
export function diasDesde(iso, ahora = Date.now()){
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.floor((ahora - t) / 864e5) : null;
}
