// ADAMANT · aislación térmica ORIENTATIVA (calculadora, NO dibuja). Estima la transmitancia térmica K
// (W/m²K) del muro según el aislante y su ubicación, el m² de material y avisa del PUENTE TÉRMICO
// —el problema central del steel frame— y del riesgo de condensación. Se compara con los niveles de
// la norma IRAM 11605 (zona bioambiental templado-fría, IV/V).
//
// Puro (sin DOM ni Three). Es análisis, no dibujo: respeta "Adamant dibuja solo estructura".
// ⚠ Valores de literatura (IRAM 11601/11605). El cálculo higrotérmico fino lo hace un profesional.
import { nivelKporZona } from "./clima.mjs";

// Conductividad térmica λ (W/mK) de aislantes habituales.
export const AISLANTES = {
  "Lana de vidrio": 0.040,
  "Lana de roca": 0.038,
  "Celulosa proyectada": 0.039,
  "EPS (telgopor)": 0.035,
  "Poliuretano proyectado": 0.024
};
export const ESPESORES = [50, 70, 100, 120];         // mm
// Resistencias superficiales (IRAM 11601, muro vertical) + capas no estructurales asumidas (placa/cámara).
const Rsi = 0.13, Rse = 0.04, R_OTROS = 0.10;
// Puente térmico: qué fracción del R del aislante sobrevive si va ENTRE montantes (el metal conduce).
const PUENTE = { steel: 0.50, wood: 0.90 };          // acero: se pierde ~50%; madera puentea poco
// El K máximo por nivel (B = recomendado · C = mínimo) sale de la zona bioambiental del proyecto
// (IRAM 11605): zonas más frías piden K más bajo. Default IV (templada fría) si no se especifica.

const areaVanos = vanos => (vanos || []).reduce((a, v) => a + Math.max(0, (+v.x2 - +v.x1)) * Math.max(0, (+v.h - (+v.sill || 0))), 0);

// Área NETA de muros de la envolvente (m²), descontando aberturas.
function areaMuros(input){
  if (input.kind === "muro"){
    const bruto = (+input.largo || 0) * (+input.alto || 0);
    return Math.max(0, bruto - areaVanos(input.vanos)) / 1e6;
  }
  if (input.kind === "combinado"){
    const per = 2 * ((+input.largo || 0) + (+input.ancho || 0));
    const bruto = per * (+input.alto || 0);
    const vanos = ["Frente", "Fondo", "Izq", "Der"].reduce((a, l) => a + areaVanos(input["vano" + l]), 0);
    return Math.max(0, bruto - vanos) / 1e6;
  }
  return 0;
}

// Calcula la aislación. opts = { tipo, espesor(mm), ubicacion: "entre"|"continua" }. → objeto de resultado.
export function aislacion(input, opts = {}){
  const tipo = AISLANTES[opts.tipo] != null ? opts.tipo : "Lana de vidrio";
  const espesor = ESPESORES.includes(+opts.espesor) ? +opts.espesor : 100;
  const ubicacion = opts.ubicacion === "entre" ? "entre" : "continua";
  const sistema = input.sistema === "wood" ? "wood" : "steel";
  const lambda = AISLANTES[tipo];
  const NIVEL = nivelKporZona(opts.zonaBio);          // K máx por zona bioambiental (default IV)

  const Rais = (espesor / 1000) / lambda;
  const factor = ubicacion === "entre" ? PUENTE[sistema] : 1;   // continua = corta el puente
  const Rais_ef = Rais * factor;
  const Rtot = Rsi + Rse + R_OTROS + Rais_ef;
  const K = 1 / Rtot;

  const estado = K <= NIVEL.B ? "ok" : K <= NIVEL.C ? "atencion" : "fuera";
  const area = areaMuros(input);
  const m2 = Math.ceil(area * 1.05);                            // +5% de recorte/solape

  const avisos = [];
  if (ubicacion === "entre" && sistema === "steel")
    avisos.push({ tono: "fuera", titulo: "Puente térmico por los montantes",
      texto: "En steel frame el acero conduce mucho: con el aislante solo entre montantes perdés cerca de la mitad. Poné una capa CONTINUA por fuera (EPS/poliuretano) para cortar el puente térmico.",
      fix: { ubicacion: "continua" }, fixLabel: "Pasar a aislación continua" });
  if (estado === "fuera")
    avisos.push({ tono: "fuera", titulo: "No llega al mínimo de norma",
      texto: `Con K=${K.toFixed(2)} el muro no alcanza el mínimo (K≤${NIVEL.C}). Subí el espesor o usá un aislante mejor (poliuretano/EPS).` });
  avisos.push({ tono: "info", titulo: "Condensación",
    texto: "En clima frío o húmedo, poné barrera de vapor del lado caliente (interior) para que no condense adentro del muro." });

  return {
    area: +area.toFixed(1), m2, tipo, espesor, ubicacion, sistema,
    bio: opts.zonaBio || "IV",
    K: +K.toFixed(2), R: +Rtot.toFixed(2), factorPuente: factor,
    estado, nivel: NIVEL, avisos,
    resumen: estado === "ok" ? `Bien aislado (K=${K.toFixed(2)}).`
      : estado === "atencion" ? `Aislación justa (K=${K.toFixed(2)}): cumple el mínimo pero no el recomendado.`
      : `Aislación insuficiente (K=${K.toFixed(2)}).`
  };
}
