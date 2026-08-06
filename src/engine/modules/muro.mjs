// Módulo constructivo: Muro / Tabique con vanos. Adamant calcula y dibuja ESTRUCTURA.
// El TIPO de muro (exterior / interior portante / tabique) define perfilería, barra comercial,
// arriostramiento y dintel: un tabique no portante va con perfilería liviana, no PGC/PGU.
import { buildPieces } from "../frame.mjs";
import { buildBraces } from "../brace.mjs";
import { computeMaterials } from "../materials.mjs";
import { resolveSystem } from "../systems.mjs";

// Defaults completos por tipo: elegir el tipo deja el muro listo para armar sin tocar nada más.
const TIPO_DEFAULTS = {
  exterior: { arriostramiento: "cruz",    opciones: { modulo: 400, pgc: "PGC 100x1.25", pgu: "PGU 100x1.25" } },
  interior: { arriostramiento: "cruz",    opciones: { modulo: 400, pgc: "PGC 100x1.25", pgu: "PGU 100x1.25" } },
  tabique:  { arriostramiento: "ninguno", opciones: { modulo: 400, montPlaca: "Montante 70" } }
};

export const muro = {
  id: "muro",
  nombre: "Muro / Tabique",
  descripcion: "Paredes y tabiques con aberturas.",
  icono: "🧱",

  defaults(){
    const tipoMuro = "exterior";
    return {
      sistema: "steel", tipoMuro, largo: 3000, alto: 2600, vanos: [],
      arriostramiento: TIPO_DEFAULTS[tipoMuro].arriostramiento,
      opciones: { lumber: "2x6 (38×140)", ...TIPO_DEFAULTS[tipoMuro].opciones }
    };
  },

  // schema del wizard: el TIPO va primero (antes de las medidas) y define los defaults; el
  // arriostramiento se oculta en tabiques (no aplica).
  schema: {
    pasos: [
      { id: "tipo", titulo: "Tipo de muro", campos: [
        { k: "sistema", tipo: "sistema" },
        { k: "tipoMuro", tipo: "cards", label: "¿Qué muro es?", opciones: [
          { v: "exterior", titulo: "Muro exterior", desc: "Cierra la casa hacia afuera. Aguanta viento, lluvia y frío." },
          { v: "interior", titulo: "Muro interior portante", desc: "Divide adentro, pero sostiene el piso o el techo de arriba." },
          { v: "tabique",  titulo: "Tabique divisorio", desc: "Solo divide ambientes. No sostiene nada más que a sí mismo." }
        ], onSet: (p, v) => { const d = TIPO_DEFAULTS[v]; p.arriostramiento = d.arriostramiento; Object.assign(p.opciones, d.opciones); } }
      ]},
      { id: "medidas", titulo: "Medidas", campos: [
        { k: "largo", tipo: "medida", label: "Largo", rango: [500, 12000] },
        { k: "alto",  tipo: "medida", label: "Alto",  rango: [2000, 3500] }
      ], avanzado: [
        // Modulación: 400 fijo en muros portantes (no se muestra); 400/600 elegible sólo en el tabique.
        { k: "modulo", opt: true, tipo: "seg", label: "Modulación", soloSi: p => p.tipoMuro === "tabique",
          opciones: [{ v: 400, l: "400 mm" }, { v: 600, l: "600 mm" }] },
        // Arriostramiento: sólo en muros portantes. En un tabique no aplica → se oculta.
        { k: "arriostramiento", tipo: "seg", label: "Arriostramiento", soloSi: p => p.tipoMuro !== "tabique",
          opciones: [{ v: "ninguno", l: "Ninguno" }, { v: "cruz", l: "Cruz de San Andrés" }, { v: "diagonal", l: "Riostra rígida" }] },
        { tipo: "perfil" }
      ]},
      { id: "aberturas", titulo: "Aberturas", componente: "vanos" }
    ]
  },

  generar(input){
    const s = resolveSystem(input);
    let piezas = buildPieces(input);
    piezas.forEach(p => { if (p.tipo === "SOL.PANEL" && p.pos[2] < 1) p.nombre = "Solera inferior (sobre plataforma)"; });
    // Rol en el ambiente: un muro PASANTE o ENCAJADO NO lleva sus montantes de extremo — el poste de
    // esquina (que arma el orquestador con el solver de esquinas) los reemplaza. Aislado (default): los deja.
    const rol = input.rol || "aislado", larg = +input.largo;
    if (rol !== "aislado")
      piezas = piezas.filter(p => !(p.tipo === "MONTANTE" && (p.pos[0] < 1 || p.pos[0] > larg - s.cf - 1)));
    // Arriostramiento (sólo portantes; en tabique arriostramiento="ninguno" → buildBraces no agrega nada).
    const br = buildBraces(input);
    piezas.push(...br.piezas);
    return {
      piezas,
      metadatos: { nombre: "Muro / Tabique", esquema: "frontal", barLen: s.barLen, sistema: input.sistema,
        tipoMuro: input.tipoMuro, rol, drywall: !!s.drywall, avisos: br.avisos, cruces: br.zonas }
    };
  },

  materiales(piezas, input){ return computeMaterials(input, piezas); }
};
