// Módulo constructivo: Cielorraso suspendido de DOS NIVELES (sistema real).
// Jerarquía, de arriba hacia abajo:
//   VELAS         — verticales, cuelgan de la losa y se fijan a las vigas maestras, cada VELA_SEP a lo
//                   largo de cada maestra. Largo = distancia de suspensión.
//   VIGAS MAESTRAS— perfiles CONTINUOS de largo completo, transversales, cada MAESTRA_SEP, en el plano
//                   SUPERIOR (z = alma..2·alma). Cuelgan de las velas.
//   MONTANTES     — perfiles CONTINUOS cada MONTANTE_SEP, perpendiculares a las maestras, en el plano
//                   INFERIOR (z = 0..alma), atornillados por debajo de ellas. Sobre ellos va la placa.
//   SOLERAS       — perimetrales (PGU) fijadas a los muros, en el plano de los montantes (encastran).
// Ejes del motor: X = largo, Y = ancho, Z = altura de perfil. Montantes corren en X (repartidos en Y);
// maestras corren en Y (repartidas en X). Todo se dibuja en z=0 y se ELEVA a `alt` vía metadatos.
// Sólo steel/aluminio (sin variante wood). Sin vanos (trampa → backlog).
import { CIELO, cutOpts, VELA_SEP, MAESTRA_SEP, MONTANTE_SEP, BORDE_LIBRE, RIGIDIZA_MARGEN } from "../systems.mjs";
import { cutList, optimizeCuts } from "../cuts.mjs";

const perfDe = o => (o && CIELO[o.perfil]) ? o.perfil : "Solera/montante 70";

// Soportes intermedios CENTRADOS en un tramo [0, span]: separación ≤ sep, simétricos respecto del
// centro, sin soportes a menos de BORDE_LIBRE de los extremos (el borde ya lo toma la solera). Devuelve
// los centros; [] si el tramo es chico (≤ 2·BORDE_LIBRE + RIGIDIZA_MARGEN → la solera sola alcanza).
function soportesCentrados(span, sep){
  if (span <= 2 * BORDE_LIBRE + RIGIDIZA_MARGEN) return [];
  const n = Math.max(1, Math.ceil(span / sep) - 1), step = span / (n + 1), pts = [];
  for (let i = 1; i <= n; i++){ const p = Math.round(step * i); if (p >= BORDE_LIBRE && p <= span - BORDE_LIBRE) pts.push(p); }
  return pts;
}

export const cielo = {
  id: "cielo",
  nombre: "Cielorraso suspendido",
  descripcion: "Grilla de dos niveles (maestras + montantes) colgada del techo.",
  icono: "☁️",

  defaults(){
    return { sistema: "steel", largo: 4000, ancho: 3000, alt: 2600, suspension: 400, modulo: MONTANTE_SEP,
      opciones: { perfil: "Solera/montante 70" } };
  },

  schema: {
    pasos: [
      { id: "medidas", titulo: "Medidas", campos: [
        { k: "largo", tipo: "medida", label: "Largo", rango: [1000, 12000] },
        { k: "ancho", tipo: "medida", label: "Ancho", rango: [1000, 12000] },
        { k: "alt",   tipo: "medida", label: "Altura de cielorraso", rango: [2200, 4000] },
        { k: "modulo", tipo: "seg", label: "Separación de montantes", opciones: [{ v: 400, l: "400 mm" }, { v: 600, l: "600 mm" }] }
      ], avanzado: [
        { k: "suspension", tipo: "medida", label: "Suspensión a la losa", rango: [50, 1500] },
        { k: "perfil", opt: true, tipo: "seg", label: "Perfil", opciones: Object.keys(CIELO).map(k => ({ v: k, l: k })) }
      ] }
    ]
  },

  generar(input){
    const largo = +input.largo, ancho = +input.ancho;
    const montSep = +input.modulo || MONTANTE_SEP;
    const alt = +input.alt || 2600, susp = +input.suspension || 400;
    const perfil = perfDe(input.opciones), fl = CIELO[perfil].fl, alma = CIELO[perfil].a;
    const P = [];

    // SOLERAS (PGU) perimetrales, plano inferior, esquinas a tope: 2 corren el largo (X) completas;
    // 2 corren el ancho (Y) entre ellas (ancho − 2·fl). Son las 2 líneas de borde del grillado.
    const anchoIn = Math.max(ancho - 2 * fl, 10);
    P.push({ tipo: "SOLERA", perfil, largo,          pos: [0, 0, 0],           axis: "x", mat: "solera" });
    P.push({ tipo: "SOLERA", perfil, largo,          pos: [0, ancho - fl, 0],  axis: "x", mat: "solera" });
    P.push({ tipo: "SOLERA", perfil, largo: anchoIn, pos: [0, fl, 0],          axis: "y", mat: "solera" });
    P.push({ tipo: "SOLERA", perfil, largo: anchoIn, pos: [largo - fl, fl, 0], axis: "y", mat: "solera" });

    // MONTANTES (PGC) plano inferior, corren X (encastrados: fl..largo−fl), repartidos en Y cada montSep.
    // Las 2 soleras que corren el largo son las líneas de borde → montantes interiores. Con esas soleras
    // el grillado tiene ceil(ancho/montSep)+1 líneas (montantes + 2 soleras de borde).
    const montLargo = Math.max(largo - 2 * fl, 10), montYs = [];
    for (let y = montSep; y < ancho - fl; y += montSep){
      P.push({ tipo: "MONTANTE", perfil, largo: montLargo, pos: [fl, y, 0], axis: "x", mat: "montante" });
      montYs.push(y);
    }

    // VIGAS MAESTRAS (continuas, largo completo = ancho) plano SUPERIOR (z = alma..2·alma), corren Y,
    // CENTRADAS en la luz X (no arrancan del borde): sostienen el centro, el perímetro lo toma la solera.
    const maestraCx = soportesCentrados(largo, MAESTRA_SEP);
    maestraCx.forEach(cx => P.push({ tipo: "MAESTRA", perfil, largo: ancho, pos: [cx - fl / 2, 0, alma], axis: "y", mat: "maestra" }));

    // VELAS: soportes intermedios CENTRADOS a lo largo de cada maestra (Y), separación ≤ VELA_SEP, sin
    // velas dentro de BORDE_LIBRE de los extremos. Verticales (largo = suspensión), del plano superior a la losa.
    const velaCy = soportesCentrados(ancho, VELA_SEP);
    maestraCx.forEach(cx => velaCy.forEach(cy =>
      P.push({ tipo: "VELA", perfil, largo: susp, pos: [cx - fl / 2, cy - fl / 2, 2 * alma], axis: "z", mat: "vela" })));

    return { piezas: P, metadatos: { nombre: "Cielorraso suspendido", esquema: "planta",
      sistema: "steel", planta: { x: largo, y: ancho },
      nMontantes: montYs.length, nMaestras: maestraCx.length, nVelaPorMaestra: velaCy.length,
      elevacion: alt, planoSuperior: alma, // separación entre el plano de montantes y el de maestras
      vistas: [{ id: "iso-abajo", l: "Montaje" }, { id: "abajo", l: "Desde abajo" }], vistaDefault: "iso-abajo" } };
  },

  materiales(piezas, input){
    const perfil = perfDe(input.opciones), kgM = CIELO[perfil].kg, susp = +input.suspension || 400;
    const { byProfile } = cutList(piezas);
    // maestras = barras largas; velas = recortes; todo el mismo perfil → First-Fit con su barLen (3 m).
    const perfiles = optimizeCuts(byProfile, cutOpts(input)).map(o => ({
      perfil: o.perfil, metros: +(byProfile[o.perfil].reduce((a, b) => a + b, 0) / 1000).toFixed(2),
      piezas: o.piezas, barras: o.bars, largoBarra: o.barLen, sobrantes: o.over
    }));
    const L = +input.largo, W = +input.ancho, area = (L * W) / 1e6;
    const peso = piezas.reduce((a, p) => a + (p.largo / 1000) * kgM, 0);

    const nMont = piezas.filter(p => p.tipo === "MONTANTE").length;
    const nMaestra = piezas.filter(p => p.tipo === "MAESTRA").length;
    const nVela = piezas.filter(p => p.tipo === "VELA").length;
    const perim = 2 * (L + W) / 1000;

    const otros = [
      { key: "fija-perim", label: "Fijación perimetral solera↔muro (tarugo + tornillo, ~cada 400 mm)", unidad: "u", cantidad: Math.ceil(perim * 1000 / 400) },
      { key: "fija-vela", label: `Fijación de vela a losa ${susp} mm (tarugo + tornillo)`, unidad: "u", cantidad: nVela }
    ];
    // T1 estructurales: cruces montante↔maestra + velas (a maestra + a losa) + montante↔solera
    const t1 = nMont * nMaestra + nVela + nMont * 2;
    return { sistema: "steel", nVanos: 0, area: +area.toFixed(2), peso: +peso.toFixed(1),
      perfiles, otros, placas: [], aislacion: 0, tornillos: { t1, t2: 0 }, barLen: perfiles[0]?.largoBarra || 3000 };
  }
};
