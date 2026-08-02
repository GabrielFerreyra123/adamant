// ADAMANT · comparador de sistemas (steel · wood · tradicional). Vende la construcción en seco:
// costo, tiempo y peso comparados sobre la MISMA geometría del proyecto.
//
// Honestidad: el COSTO DE ESTRUCTURA y el PESO de steel y wood son REALES (los calcula Adamant sobre
// la misma obra). El costo de mercado por m², el tiempo y lo tradicional son BENCHMARKS de literatura
// de mercado AR (semilla, a calibrar) — Adamant no computa mampostería. Todo va rotulado como estimación.
import { computeProject } from "./index.mjs";
import { precioRef } from "../config/precios-referencia.js";

// Benchmarks de mercado (SEMILLA, ARS 2026, a calibrar). Por m² de superficie de la obra.
export const BENCH = {
  steel:       { label: "Steel frame",  costoM2: 750000, diasM2: 0.9, kgM2: null },
  wood:        { label: "Wood frame",   costoM2: 700000, diasM2: 1.0, kgM2: null },
  tradicional: { label: "Tradicional (ladrillo)", costoM2: 820000, diasM2: 2.3, kgM2: 450 }
};

// Asegura secciones de ambos sistemas presentes al recomputar la misma obra en el otro sistema.
const withSys = (input, sys) => ({ ...input, sistema: sys,
  opciones: { pgc: "PGC 100x0.90", pgu: "PGU 100x0.90", lumber: "2x6 (38×140)", modulo: 400, ...input.opciones } });

// Costo REAL de la estructura (suma de la lista de compra × precio de referencia) + peso.
function estructura(input){
  const { materiales } = computeProject(input);
  let total = 0;
  (materiales.perfiles || []).forEach(p => total += (p.barras || 0) * precioRef(`perf:${p.perfil}`));
  if (materiales.tornillos?.t1) total += materiales.tornillos.t1 * precioRef("t1");
  (materiales.otros || []).forEach(o => total += (o.cantidad || 0) * precioRef(o.key));
  return { costo: Math.round(total), peso: materiales.peso || 0 };
}

// Superficie de obra relevante (m²): ambiente → planta; muro → superficie de pared.
function areaObra(input){
  if (input.kind === "combinado") return (+input.largo || 0) * (+input.ancho || 0) / 1e6;
  if (input.kind === "muro") return (+input.largo || 0) * (+input.alto || 0) / 1e6;
  return 0;
}

// Compara los tres sistemas. → { area, sistemas:{steel,wood,tradicional}, destacados[], bench }
export function comparar(input){
  const area = +areaObra(input).toFixed(1);
  const steel = estructura(withSys(input, "steel"));
  const wood = estructura(withSys(input, "wood"));
  const mercado = s => ({
    label: BENCH[s].label,
    costoM2: BENCH[s].costoM2,
    costoObra: Math.round(area * BENCH[s].costoM2),
    dias: Math.max(1, Math.round(area * BENCH[s].diasM2))
  });
  const sistemas = {
    steel:       { ...mercado("steel"),       estructura: steel.costo, peso: Math.round(steel.peso) },
    wood:        { ...mercado("wood"),        estructura: wood.costo,  peso: Math.round(wood.peso) },
    tradicional: { ...mercado("tradicional"), estructura: null,        peso: Math.round(area * BENCH.tradicional.kgM2) }
  };

  const dSeco = sistemas.steel.dias, dTrad = sistemas.tradicional.dias;
  const rPeso = sistemas.steel.peso > 0 ? Math.round(sistemas.tradicional.peso / sistemas.steel.peso) : 0;
  const destacados = [];
  if (dTrad > dSeco) destacados.push(`En seco terminás en ~${dSeco} día${dSeco!==1?"s":""}; en tradicional, ~${dTrad}. Menos tiempo = menos costo de mano de obra.`);
  if (rPeso >= 2) destacados.push(`La estructura en seco pesa ${rPeso >= 10 ? "más de 10×" : "unas " + rPeso + "×"} menos que la tradicional → fundación más chica y barata.`);
  destacados.push("En seco no hay agua ni fraguado: se avanza con lluvia y se habita antes.");
  destacados.push("El seco lleva la aislación integrada en el muro; el ladrillo casi no aísla solo.");

  return { area, sistemas, destacados, bench: BENCH };
}
