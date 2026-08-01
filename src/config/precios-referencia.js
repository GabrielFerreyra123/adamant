// ADAMANT · precios de REFERENCIA (estimativo, mercado argentino). Pre-cargan el presupuesto para que
// salga completo sin que el usuario cargue nada; los precios que el usuario ingresa en Materiales SIEMPRE
// tienen prioridad sobre estos (ver getPrice/localStorage).
//
// Diseño para refrescar fácil (contra la inflación): la PERFILERÍA no se hardcodea perfil por perfil —
// se deriva de un único $/kg de acero galvanizado × (kg/m del perfil) × (largo de barra). La MADERA, de
// un $/m³. El resto son precios fijos por unidad de venta. Para actualizar: `scripts/actualizar-precios.mjs`.
//
// ⚠ Son ESTIMACIONES para arrancar. Calibralas una vez con tu corralón (editá los números de abajo).
import { PGC, PGU, PGO, PGO_PERFIL, CIELO, MONT_PLACA, SOL_PLACA, LUMBER, barLenOf } from "../engine/systems.mjs";

export const PRECIOS_REF = {
  vigenteDesde: "2026-07-30",
  fuente: "estimación de mercado AR — calibrar con tu corralón",
  aceroKgGalv: 2500,   // ARS por kg de perfil galvanizado (PGC · PGU · PGO · cielorraso · tabique)
  maderaM3: 900000,    // ARS por m³ de madera (pino/impregnada) para wood frame
  // Precios fijos por unidad de venta (la unidad la define el módulo en `materiales.otros`).
  fijos: {
    t1: 30,                       // tornillo estructural (u)
    "placa-piso": 55000,          // placa OSB/fenólico 18 mm 1,22×2,44 (u)
    "solera-asiento": 2500,       // madera impregnada (m)
    "pgu-implantacion": 7000,     // PGU de implantación perimetral (m)
    "anclaje-implantacion": 1200, // anclaje expansión/químico (u)
    "anclaje-cabriada": 1200,     // anclaje anti-succión de cabriada (u)
    "banda-estanca": 1500,        // banda estanca / aislador de apoyo (m)
    "chapa": 22000,               // cubierta (m²)
    "cumbrera": 8000,             // cumbrera (m)
    "fija-perim": 80,             // fijación de perímetro de placa (u)
    "fija-vela": 150,             // fijación de vela a losa (u)
    "rigidizador": 2000,          // rigidizador de alma (u)
    "tensor": 1000,               // tensor para fleje (u)
    "fleje-rollo": 45000,         // fleje 30×0,5 galvanizado, rollo (u)
    "fleje-cielo-rollo": 50000,   // fleje 38×0,84 arriostre de cielo, rollo (u)
    "carp-puerta": 220000,        // hoja de puerta (u) — a calibrar
    "carp-ventana": 180000        // ventana (u) — a calibrar
  }
};

// kg/m de un perfil de acero (PGC/PGU/PGO/cielo/tabique), o null si no es de acero.
function kgPerfilAcero(name){
  if (PGC[name]) return PGC[name].kg;
  if (PGU[name]) return PGU[name].kg;
  if (name === PGO_PERFIL) return PGO.kg;
  if (CIELO[name]) return CIELO[name].kg;
  if (MONT_PLACA[name]) return MONT_PLACA[name].kg;
  if (SOL_PLACA[name]) return SOL_PLACA[name].kg;
  return null;
}

// Precio de referencia de una BARRA/TIRA de un perfil (unidad de venta comercial).
export function precioRefPerfil(name){
  const p = PRECIOS_REF, largoM = barLenOf(name, {}) / 1000;
  const kg = kgPerfilAcero(name);
  if (kg != null) return Math.round(kg * largoM * p.aceroKgGalv);
  const w = LUMBER[name];
  if (w) return Math.round((w.e * w.a / 1e6) * largoM * p.maderaM3); // volumen (m³) × $/m³
  return 0;
}

// Precio de referencia por CLAVE del presupuesto ("perf:<perfil>", "t1", o una clave de `otros`).
export function precioRef(key){
  if (!key) return 0;
  if (key.startsWith("perf:")) return precioRefPerfil(key.slice(5));
  return PRECIOS_REF.fijos[key] ?? 0;
}

// Rubros del presupuesto (agrupado y prolijo). Compartido por la app (Materiales) y el PDF.
const RUBRO_MAP = {
  t1: "Tornillería y fijaciones", "fija-perim": "Tornillería y fijaciones", "fija-vela": "Tornillería y fijaciones",
  "anclaje-implantacion": "Tornillería y fijaciones", "anclaje-cabriada": "Tornillería y fijaciones",
  tensor: "Tornillería y fijaciones", rigidizador: "Tornillería y fijaciones",
  "placa-piso": "Placas y madera", "solera-asiento": "Placas y madera",
  chapa: "Cubierta", cumbrera: "Cubierta", "banda-estanca": "Cubierta",
  "fleje-rollo": "Flejes", "fleje-cielo-rollo": "Flejes",
  "pgu-implantacion": "Implantación",
  "carp-puerta": "Carpintería", "carp-ventana": "Carpintería"
};
export const RUBROS_ORDEN = ["Perfilería", "Placas y madera", "Cubierta", "Flejes", "Tornillería y fijaciones", "Implantación", "Carpintería", "Otros"];
export const rubroDe = key => (key || "").startsWith("perf:") ? "Perfilería" : (RUBRO_MAP[key] || "Otros");
