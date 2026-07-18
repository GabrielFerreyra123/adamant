// ADAMANT · motor de entramado — API pública.
// computeProject({ kind?, sistema, largo, alto, vanos, opciones, ... }) → { piezas, metadatos, materiales, cortes }
// Funciones puras, sin DOM. El tipo de construcción lo resuelve el registro de módulos (default: muro).
// La geometría (`piezas`) es la única fuente de verdad: corte y materiales se derivan de ella.
import { cutList, optimizeCuts, cutPlan } from "./cuts.mjs";
import { cutOpts } from "./systems.mjs";
import { getModule, listModules } from "./modules/index.mjs";

export function computeProject(input){
  const mod = getModule(input.kind);
  const { piezas, metadatos } = mod.generar(input);
  const { groups, byProfile } = cutList(piezas);
  const optimizado = optimizeCuts(byProfile, cutOpts(input)); // largo de barra por perfil
  const materiales = mod.materiales(piezas, input);
  return { piezas, metadatos, materiales, cortes: { grupos: groups, optimizado } };
}

// Reexports (compatibilidad con tests y consumidores del pipeline).
export { buildPieces } from "./frame.mjs";
export { computeMaterials } from "./materials.mjs";
export { cutList, optimizeCuts, cutPlan, getModule, listModules };
export * from "./systems.mjs"; // incluye resolveSystem, PGC, PGU, LUMBER, etc.
