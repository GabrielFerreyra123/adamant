// Registro de módulos constructivos. Agregar un tipo = importarlo acá (y nada más del core).
// Interfaz: { id, nombre, descripcion, icono, schema, defaults(), generar(input), materiales(piezas, input) }.
import { muro } from "./muro.mjs";
import { piso } from "./piso.mjs";
import { cielo } from "./cielo.mjs";
import { combinado } from "./combinado.mjs";
import { techo } from "./techo.mjs";

const MODULES = [muro, piso, cielo, techo, combinado];
const byId = Object.fromEntries(MODULES.map(m => [m.id, m]));

export function listModules(){ return MODULES; }
export function getModule(id){ return byId[id] || muro; } // por defecto, Muro (compatibilidad)
