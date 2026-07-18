// Re-export de la geometría pura del motor (movida a src/engine/geometry.mjs para poder usarla también
// desde el módulo combinado sin ciclo engine↔viewer). El visor y los tests siguen importando desde acá.
export { secDims, pieceBoxEngine, boundsEngine, boundsThree } from "../engine/geometry.mjs";
