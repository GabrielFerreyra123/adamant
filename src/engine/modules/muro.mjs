// Módulo constructivo: Muro / Tabique con vanos. Migración del MVP a la interfaz de módulos (F6).
// No cambia el comportamiento: reutiliza buildPieces + computeMaterials existentes.
import { buildPieces } from "../frame.mjs";
import { computeMaterials } from "../materials.mjs";
import { resolveSystem } from "../systems.mjs";

const TIPO_DEFAULTS = {
  tabique: { revInt:"Durlock 12.5", revExt:"Durlock 12.5",      aislacion:false },
  muro:    { revInt:"Durlock 12.5", revExt:"OSB / Fenólico 10", aislacion:true  }
};

export const muro = {
  id: "muro",
  nombre: "Muro / Tabique",
  descripcion: "División o cierre vertical, con puertas y ventanas.",
  icono: "🧱",

  // valores iniciales del proyecto
  defaults(){
    return {
      sistema: "steel", tipo: "tabique", largo: 3000, alto: 2600, vanos: [],
      opciones: { modulo: 400, pgc: "PGC 100x0.90", pgu: "PGU 100x0.90", lumber: "2x6 (38×140)", ...TIPO_DEFAULTS.tabique }
    };
  },

  // schema del wizard: el wizard se autogenera desde estos pasos/campos
  schema: {
    pasos: [
      { id: "proyecto", titulo: "Sistema", campos: [
        { k: "sistema", tipo: "sistema" },
        { k: "tipo", tipo: "cards", label: "Tipo", opciones: [
          { v: "tabique", titulo: "Tabique interior", desc: "División interior. Placa de yeso ambas caras, sin aislación." },
          { v: "muro", titulo: "Muro exterior", desc: "Cierre exterior. Yeso adentro, OSB/cementicia afuera, con aislación." }
        ], onSet: (p, v) => Object.assign(p.opciones, TIPO_DEFAULTS[v]) }
      ]},
      { id: "medidas", titulo: "Medidas", campos: [
        { k: "largo", tipo: "medida", label: "Largo", rango: [500, 12000] },
        { k: "alto",  tipo: "medida", label: "Alto",  rango: [2000, 3500] }
      ], avanzado: [
        { k: "modulo", opt: true, tipo: "seg", label: "Modulación", opciones: [{ v: 400, l: "400 mm" }, { v: 600, l: "600 mm" }] },
        { tipo: "perfil" }
      ]},
      { id: "aberturas", titulo: "Aberturas", componente: "vanos" }
    ]
  },

  generar(input){
    const s = resolveSystem(input);
    const piezas = buildPieces(input);
    // Nombre de la solera inferior para distinguirla en el listado (apoya sobre la plataforma de piso).
    // No cambia geometría ni `tipo` (los tests siguen contando "SOL.PANEL").
    piezas.forEach(p => { if (p.tipo === "SOL.PANEL" && p.pos[2] < 1) p.nombre = "Solera inferior (sobre plataforma)"; });
    return {
      piezas,
      metadatos: { nombre: "Muro / Tabique", esquema: "frontal", barLen: s.barLen, sistema: input.sistema }
    };
  },
  materiales(piezas, input){ return computeMaterials(input, piezas); }
};
