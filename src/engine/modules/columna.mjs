// Módulo dummy de prueba (F6): "Columna simple" — 4 parantes verticales.
// Sirve de criterio de aceptación: se agrega un tipo tocando SOLO src/engine/modules/,
// y fluye por todo el pipeline (visor, cortes, materiales, PDF, export) sin tocar el core.
import { resolveSystem } from "../systems.mjs";
import { cutList, optimizeCuts } from "../cuts.mjs";

export const columna = {
  id: "columna",
  nombre: "Columna simple",
  descripcion: "Cuatro parantes verticales (prueba de arquitectura).",
  icono: "🏛️",

  defaults(){
    return { sistema: "steel", alto: 2600, lado: 200,
      opciones: { modulo: 400, pgc: "PGC 100x0.90", pgu: "PGU 100x0.90", lumber: "2x6 (38×140)" } };
  },

  schema: {
    pasos: [
      { id: "config", titulo: "Columna", campos: [
        { k: "sistema", tipo: "sistema" },
        { k: "alto", tipo: "medida", label: "Alto", rango: [500, 6000] },
        { k: "lado", tipo: "medida", label: "Lado (huella)", rango: [100, 1000] }
      ], avanzado: [ { tipo: "perfil" } ] }
    ]
  },

  generar(input){
    const s = resolveSystem(input), H = +input.alto, L = +input.lado || 200;
    const piezas = [[0,0], [L,0], [0,L], [L,L]].map(([x,y]) =>
      ({ tipo: "MONTANTE", perfil: s.perfilMont, largo: H, pos: [x, y, 0], axis: "z", mat: "montante" }));
    return { piezas, metadatos: { nombre: "Columna", esquema: "planta", barLen: s.barLen, sistema: input.sistema } };
  },

  materiales(piezas, input){
    const s = resolveSystem(input);
    const { byProfile } = cutList(piezas);
    const perfiles = optimizeCuts(byProfile, s.barLen).map(o => ({
      perfil: o.perfil, metros: +(byProfile[o.perfil].reduce((a, b) => a + b, 0) / 1000).toFixed(2),
      piezas: o.piezas, barras: o.bars, largoBarra: s.barLen, sobrantes: o.over
    }));
    const peso = piezas.reduce((a, p) => a + (p.largo / 1000) * s.kgM, 0);
    return { sistema: input.sistema, nMont: piezas.length, nVanos: 0, area: 0, alto: +input.alto,
      peso: +peso.toFixed(1), perfiles, placas: [], aislacion: 0, tornillos: { t1: piezas.length * 2, t2: 0 }, barLen: s.barLen };
  }
};
