// ADAMANT · catálogo base de ítems presupuestables. Puro (sin DOM ni localStorage).
//
// El `id` es ESTABLE y sale del tipo + la medida, nunca del nombre visible: si mañana cambia el
// rótulo ("Durlock 12.5" → "Placa de yeso 12,5"), los precios guardados siguen enganchando.
// localStorage sólo guarda { precio, actualizado } por id; el resto (nombre, categoría, unidad) vive
// acá, así agregar ítems en versiones futuras no rompe los datos ya cargados.
import { PGC, PGU, LUMBER, CIELO, REVEST, FLEJE, FLEJE_PERFIL } from "./systems.mjs";

// "PGC 100x0.90" → pgc-100-0.90 · "PGU 150x1.60" → pgu-150-1.60
const idPerfilAcero = k => { const m = /^(PGC|PGU)\s+(\d+)x([\d.]+)$/.exec(k); return m ? `${m[1].toLowerCase()}-${m[2]}-${m[3]}` : null; };
// "2x6 (38×140)" → madera-2x6
const idMadera = k => `madera-${k.split(" ")[0]}`;
// "Solera/montante 70" → cielo-70
const idCielo = k => `cielo-${CIELO[k].a}`;

// Placas de revestimiento: id explícito para que el rótulo pueda cambiar sin perder el precio.
const ID_PLACA = {
  "Durlock 12.5": "placa-yeso-12.5", "Durlock 9.5": "placa-yeso-9.5",
  "OSB / Fenólico 10": "placa-osb-10", "Placa cementicia 12": "placa-cementicia-12",
  "Placa cementicia 8": "placa-cementicia-8", "Siding cementicio 12": "placa-siding-12",
  "PVC (aprox)": "placa-pvc"
};

// id del catálogo para un perfil del motor (acero, madera o cielorraso).
export function idDePerfil(perfil){
  if (PGC[perfil] || PGU[perfil]) return idPerfilAcero(perfil);
  if (LUMBER[perfil]) return idMadera(perfil);
  if (CIELO[perfil]) return idCielo(perfil);
  if (perfil === FLEJE_PERFIL) return "fleje-rollo";
  return null;
}
export const idDePlaca = material => ID_PLACA[material] || null;

const item = (id, nombre, categoria, unidad) => ({ id, nombre, categoria, unidad, precio: 0, actualizado: null });

// Catálogo base: TODO lo que los módulos pueden llegar a computar.
export const CATALOGO = [
  ...Object.keys(PGC).map(k => item(idPerfilAcero(k), k, "perfil", "barra")),
  ...Object.keys(PGU).map(k => item(idPerfilAcero(k), k, "perfil", "barra")),
  ...Object.keys(CIELO).map(k => item(idCielo(k), `${k} (cielorraso)`, "perfil", "barra")),
  ...Object.keys(LUMBER).map(k => item(idMadera(k), k, "madera", "barra")),
  ...Object.keys(REVEST).filter(k => ID_PLACA[k]).map(k => item(ID_PLACA[k], `Placa ${k}`, "placa", "placa")),
  item("placa-piso-osb-18", "Placa de piso OSB/fenólico 18 mm", "placa", "placa"),
  item("aislacion-lana", "Aislación (lana)", "aislacion", "m2"),
  item("tornillo-t1", "Tornillo T1 (estructura)", "tornilleria", "unidad"),
  item("tornillo-t2", "Tornillo T2 (placa)", "tornilleria", "unidad"),
  item("fleje-rollo", `${FLEJE_PERFIL} galvanizado (rollo ${FLEJE.rollo/1000} m)`, "fleje", "rollo"),
  item("tensor", "Tensor para fleje", "fleje", "unidad"),
  item("rigidizador", "Rigidizador de alma", "accesorio", "unidad"),
  item("pgu-implantacion", "PGU de implantación perimetral", "perfil", "m"),
  item("solera-asiento", "Solera de asiento (madera impregnada)", "madera", "m"),
  item("anclaje-implantacion", "Anclaje de expansión/químico", "accesorio", "unidad"),
  item("banda-estanca", "Banda estanca / aislador de apoyo", "accesorio", "m"),
  item("fija-perim", "Fijación de solera perimetral (cielorraso)", "tornilleria", "unidad"),
  item("fija-vela", "Fijación de vela a la losa (cielorraso)", "tornilleria", "unidad"),
  item("carp-puerta", "Puerta (hoja) — a definir", "accesorio", "unidad"),
  item("carp-ventana", "Ventana — a definir", "accesorio", "unidad")
].filter(i => i.id);

export const CAT_POR_ID = Object.fromEntries(CATALOGO.map(i => [i.id, i]));
export const CATEGORIAS = ["perfil", "madera", "placa", "aislacion", "tornilleria", "fleje", "accesorio"];
export const CAT_LABEL = { perfil:"Perfiles", madera:"Madera", placa:"Placas", aislacion:"Aislación",
  tornilleria:"Tornillería", fleje:"Arriostramiento", accesorio:"Accesorios" };

// Normaliza un nombre para el match de la migración (sin acentos, minúsculas, sin puntuación).
export const normalizar = s => String(s || "").toLowerCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
