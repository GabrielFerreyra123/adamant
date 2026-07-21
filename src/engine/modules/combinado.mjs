// Módulo COMPUESTO: Ambiente completo (piso + 4 muros) — F9a (orquestador, sin UI).
// NO reimplementa geometría: llama a los módulos Piso y Muro y REUBICA sus piezas al ambiente
// (traslada / rota 90° / eleva sobre la plataforma) fijando p.box (AABB en coords del motor). Los
// submódulos quedan intactos (mismos tests). Materiales y cortes se fusionan y se optimizan GLOBAL.
//
// Ambiente: X = largo, Y = ancho, Z = altura (piso desde z=0). Esquinas: 2 muros PASANTES (frente/fondo,
// largo = largo, corren en X) + 2 ENCAJADOS (izq/der, largo = ancho − 2·espesor, corren en Y). El muro
// encajado butt-ea contra el pasante → cada esquina queda con 2 montantes de extremo (el del pasante y
// el del encajado), sin superponerse.  Montaje platform framing: los muros apoyan SOBRE la placa de piso.
import { piso } from "./piso.mjs";
import { muro } from "./muro.mjs";
import { resolveSystem, cutOpts, FLEJE, FLEJE_PERFIL } from "../systems.mjs";
import { computeFlejes } from "../brace.mjs";
import { pieceBoxEngine, boundsEngine } from "../geometry.mjs";
import { cutList, optimizeCuts } from "../cuts.mjs";

const PLACA_ESP = 18;        // espesor de la placa de piso (mm); el muro apoya sobre ella (default)
const REV_EXT = 12, REV_INT = 12.5; // espesores nominales de revestimiento exterior / interior (mm)

// Reubica piezas de un submódulo: rot 0|90 (CCW en Z) + traslación. Setea:
//   p.box   — AABB en coords del motor (para el visor y el test AABB),
//   p.xf    — { rot, tx, ty, tz } el MISMO transform, para que el export Ruby lo reproduzca (paridad),
//   p.parte — piso/frente/fondo/izq/der (para "ver por partes" y el PDF por etapas).
function reubicar(piezas, { rot = 0, tx = 0, ty = 0, tz = 0, parte } = {}){
  // rot 90° CCW en Z: un punto (x,y) → (−y, x); lo mismo vale para los vectores de una base.
  const rotV = v => rot === 90 ? [-v[1], v[0], v[2]] : v;
  const rotP = ([x, y, z]) => rot === 90 ? [-y + tx, x + ty, z + tz] : [x + tx, y + ty, z + tz];
  return piezas.map(p => {
    const { size: [sx, sy, sz], center: [cx, cy, cz] } = pieceBoxEngine(p);
    const box = rot === 90
      ? { size: [sy, sx, sz], center: [-cy + tx, cx + ty, cz + tz] } // (x,y) → (−y, x)
      : { size: [sx, sy, sz], center: [cx + tx, cy + ty, cz + tz] };
    // Las piezas DIAGONALES (flejes) llevan su propia base: hay que transformarla igual que la caja,
    // si no el visor/export las dibujaría en la posición del submódulo.
    const orient = p.orient && { ...p.orient, c: rotP(p.orient.c),
      u: rotV(p.orient.u), v: rotV(p.orient.v), n: rotV(p.orient.n) };
    return { ...p, box, ...(orient ? { orient } : {}), xf: { rot, tx, ty, tz }, parte };
  });
}

// Descompone el ambiente en sub-inputs (piso + 4 muros) y el espesor de muro. Usado por generar y
// materiales para no duplicar la lógica de esquinas.
function descomponer(input){
  const largo = +input.largo, ancho = +input.ancho, alto = +input.alto || 2600, placa = input.placa !== false;
  const muroBase = { sistema: input.sistema, alto, opciones: input.opciones, tipo: input.tipo || "tabique" };
  // `arriostraFrente/Fondo/Izq/Der`: selector por muro (default 'cruz', son perimetrales portantes).
  const arr = lado => input["arriostra" + lado] || "cruz";
  const front = muro.generar({ ...muroBase, largo, vanos: input.vanoFrente || [], arriostramiento: arr("Frente") });
  // Espesor del muro = profundidad (Y) del FRAME. Se miden sólo las piezas estructurales: los flejes
  // van apoyados por fuera de la cara y falsearían el espesor (y con él la posición de los 4 muros).
  const e = Math.round(boundsEngine(front.piezas.filter(p => p.categoria !== "fleje")).size[1]);
  const encaj = Math.max(ancho - 2 * e, 1);
  return {
    largo, ancho, alto, placa, e, encaj, front,
    pisoInput: { sistema: input.sistema, largo, ancho, separacion: input.separacion || 400,
      apoyo: input.apoyo || "platea", placa, opciones: input.opciones },
    // Arriostramiento por muro (passthrough al módulo Muro; el orquestador no reimplementa nada).
    // `caraExterior:"ymax"` en fondo/der: esos muros se ubican sin espejar, así que su cara local
    // Y=0 mira HACIA ADENTRO del ambiente; el fleje debe salir por la cara opuesta.
    muros: [
      { parte: "frente", input: { ...muroBase, largo, vanos: input.vanoFrente || [], arriostramiento: arr("Frente") } },
      { parte: "fondo",  input: { ...muroBase, largo, vanos: input.vanoFondo || [], arriostramiento: arr("Fondo"), caraExterior: "ymax" } },
      { parte: "izq",    input: { ...muroBase, largo: encaj, vanos: input.vanoIzq || [], arriostramiento: arr("Izq"), caraExterior: "ymax" } },
      { parte: "der",    input: { ...muroBase, largo: encaj, vanos: input.vanoDer || [], arriostramiento: arr("Der") } }
    ]
  };
}

export const combinado = {
  id: "combinado",
  nombre: "Ambiente completo",
  descripcion: "Piso y 4 muros, ensamblados.",
  icono: "🏠",

  defaults(){
    return { sistema: "steel", largo: 4000, ancho: 3000, alto: 2600, apoyo: "platea", placa: true,
      opciones: { pgc: "PGC 100x0.90", pgu: "PGU 100x0.90", lumber: "2x6 (38×140)", modulo: 400 },
      vanoFrente: [], vanoFondo: [], vanoIzq: [], vanoDer: [],
      arriostraFrente: "cruz", arriostraFondo: "cruz", arriostraIzq: "cruz", arriostraDer: "cruz" };
  },

  // schema básico (el wizard con selector de muros en planta es F9c).
  schema: {
    pasos: [
      { id: "medidas", titulo: "Medidas", campos: [
        { k: "sistema", tipo: "sistema" },
        { k: "largo", tipo: "medida", label: "Largo", rango: [2000, 12000] },
        { k: "ancho", tipo: "medida", label: "Ancho", rango: [2000, 12000] },
        { k: "alto",  tipo: "medida", label: "Alto de muros", rango: [2400, 3000] }
      ], avanzado: [
        { k: "apoyo", tipo: "seg", label: "Apoyo", opciones: [{ v: "platea", l: "Platea" }, { v: "pilotines", l: "Pilotines" }] },
        { k: "placa", tipo: "seg", label: "Placa de piso", opciones: [{ v: true, l: "Sí" }, { v: false, l: "No" }] }
      ] },
      { id: "aberturas", titulo: "Aberturas", componente: "murosPlanta" }
    ]
  },

  generar(input){
    const d = descomponer(input);
    const P = [];

    // --- PISO (plataforma) --- el piso pone la corrida (lado mayor) en su X; si el ambiente tiene
    // largo < ancho queda transpuesto → rotarlo 90° para alinearlo con el ambiente (X=largo, Y=ancho).
    const pisoGen = piso.generar(d.pisoInput);
    const hEntramado = boundsEngine(pisoGen.piezas).size[2];
    const rotPiso = d.largo < d.ancho;
    P.push(...(rotPiso
      ? reubicar(pisoGen.piezas, { rot: 90, tx: d.largo, ty: 0, tz: 0, parte: "piso" })
      : reubicar(pisoGen.piezas, { parte: "piso" })));

    // Placa de piso (OSB/fenólico 18 mm) como SUPERFICIE sobre el entramado, si el toggle está activo.
    // Es una CAPA visual conmutable (arranca apagada); su geometría igual eleva los muros. El cómputo lo
    // lleva piso.materiales en `otros`; no entra en cortes (skip en cutList por `superficie`).
    if (d.placa) P.push({ tipo: "PLACA", perfil: "OSB/fenólico 18 mm", largo: d.largo, axis: "z", parte: "piso",
      capa: "placa-piso", superficie: true,
      box: { size: [d.largo, d.ancho, PLACA_ESP], center: [d.largo/2, d.ancho/2, hEntramado + PLACA_ESP/2] } });

    // --- MUROS --- apoyan SOBRE la placa si va (entramado + 18 mm) o directamente sobre el entramado.
    // En ambos casos el borde inferior del muro queda en CONTACTO con lo que tiene debajo.
    const hp = hEntramado + (d.placa ? PLACA_ESP : 0);
    const e = d.e;
    const gens = { frente: d.front, fondo: muro.generar(d.muros[1].input),
      izq: muro.generar(d.muros[2].input), der: muro.generar(d.muros[3].input) };
    P.push(...reubicar(gens.frente.piezas, { rot: 0,  tx: 0,      ty: 0,         tz: hp, parte: "frente" })); // Y ∈ [0, e]
    P.push(...reubicar(gens.fondo.piezas,  { rot: 0,  tx: 0,      ty: d.ancho-e, tz: hp, parte: "fondo" }));  // Y ∈ [ancho−e, ancho]
    P.push(...reubicar(gens.izq.piezas,    { rot: 90, tx: e,      ty: e,         tz: hp, parte: "izq" }));    // X ∈ [0, e], Y ∈ [e, ancho−e]
    P.push(...reubicar(gens.der.piezas,    { rot: 90, tx: d.largo, ty: e,        tz: hp, parte: "der" }));    // X ∈ [largo−e, largo]

    // REVESTIMIENTOS de muros como CAPAS visuales (arrancan apagadas), con los VANOS RECORTADOS al PASO
    // LIBRE y las ESQUINAS CERRADAS. Cada rev lleva su plano u×v + huecos, para que el visor lo construya
    // con THREE.Shape + holes + ExtrudeGeometry. Sólo visual (no computa; ver TODO.md).
    //   Hueco = paso libre: lateral = cara interior del jack (x1+2·cf … x2−2·cf), techo = cara inferior
    //   del dintel (v=h), piso en ventana = cara superior de la solera de antepecho (sill + espesor).
    //   Esquinas EXTERIOR: pasantes (frente/fondo) cubren la envolvente total en X ([−esp, largo+esp]);
    //   encajados (izq/der) van entre ellos, cubriendo el largo completo en Y ([0, ancho]) → tapan el
    //   canto del pasante. INTERIOR: cada muro cubre sólo su cara interna, entre esquinas interiores.
    const s = resolveSystem(input), cf = s.cf, tSill = s.wood ? s.te : s.fl;
    const vanosDe = parte => (d.muros.find(m => m.parte === parte)?.input.vanos) || [];
    const revPieza = (parte, cara) => {
      const ext = cara === "ext", esp = ext ? REV_EXT : REV_INT;
      const horiz = parte === "frente" || parte === "fondo";
      const eu = horiz ? [1, 0, 0] : [0, 1, 0], ev = [0, 0, 1], en = horiz ? [0, -1, 0] : [1, 0, 0];
      const v = d.alto;
      let u, uOrigin, origin;
      if (horiz){
        u = ext ? d.largo + 2 * REV_EXT : d.largo - 2 * e;   // pasante ext = envolvente total; int = entre esquinas
        uOrigin = ext ? -REV_EXT : e;
        const bandY = parte === "frente" ? (ext ? 0 : e + REV_INT) : (ext ? d.ancho + REV_EXT : d.ancho - e);
        origin = [uOrigin, bandY, hp];
      } else {
        u = ext ? d.ancho : d.ancho - 2 * e;                 // encajado ext = largo completo (tapa cantos); int = entre esquinas
        uOrigin = ext ? 0 : e;
        const bandX = parte === "izq" ? (ext ? -REV_EXT : e) : (ext ? d.largo : d.largo - e - REV_INT);
        origin = [bandX, uOrigin, hp];
      }
      // huecos al paso libre, en coords del plano (u desde uOrigin; el muro encajado arranca en engine y=e)
      const eBase = horiz ? 0 : e;
      const holes = vanosDe(parte).map(vn => {
        const g0 = eBase + vn.x1 + 2 * cf, g1 = eBase + vn.x2 - 2 * cf; // caras interiores de los jacks
        return { u0: Math.max(0, g0 - uOrigin), u1: Math.min(u, g1 - uOrigin),
          v0: Math.max(0, vn.sill > 0 ? vn.sill + tSill : 0), v1: Math.min(v, vn.h) };
      }).filter(h => h.u1 - h.u0 > 5 && h.v1 - h.v0 > 5);
      const center = [0,1,2].map(i => origin[i] + eu[i]*u/2 + ev[i]*v/2 + en[i]*esp/2);
      const size = [0,1,2].map(i => Math.abs(eu[i])*u + Math.abs(ev[i])*v + Math.abs(en[i])*esp);
      return { tipo: ext ? "REV.EXT" : "REV.INT", capa: ext ? "rev-ext" : "rev-int",
        parte, superficie: true, perfil: "a definir", largo: Math.round(u), axis: "z",
        box: { size, center }, rev: { u, v, esp, holes, eu, ev, en, origin } };
    };
    for (const parte of ["frente", "fondo", "izq", "der"])
      P.push(revPieza(parte, "ext"), revPieza(parte, "int"));

    // envolvente ESTRUCTURAL: los rev (superficie) y los flejes van apoyados por FUERA del frame
    const bb = boundsEngine(P.filter(p => !p.superficie && p.categoria !== "fleje"));
    // Avisos de arriostramiento de los 4 muros, prefijados con el lado (los consume la UI y el PDF).
    const LADO = { frente: "Frente", fondo: "Fondo", izq: "Lateral izq.", der: "Lateral der." };
    const avisos = Object.entries(gens).flatMap(([k, g]) => (g.metadatos.avisos || []).map(a => `${LADO[k]}: ${a}`));

    return { piezas: P, metadatos: { nombre: "Ambiente completo", esquema: "planta", avisos,
      sistema: input.sistema, planta: { x: d.largo, y: d.ancho }, elevacion: 0,
      barLen: pisoGen.metadatos.barLen, espesorMuro: e, hMuro: hp,
      partes: [{ id: "piso", l: "Piso" }, { id: "frente", l: "Frente" }, { id: "fondo", l: "Fondo" }, { id: "izq", l: "Lateral izq." }, { id: "der", l: "Lateral der." }],
      vistas: [{ id: "iso", l: "Conjunto" }, { id: "planta", l: "Planta" }], vistaDefault: "iso",
      bbox: bb.size } };
  },

  materiales(piezas, input){
    const d = descomponer(input);
    const sub = p => piezas.filter(x => x.parte === p && !x.superficie); // las superficies (placa/rev) no computan
    // materiales por submódulo (placas / aislación / tornillos / otros); los perfiles se optimizan GLOBAL.
    const pisoMat = piso.materiales(sub("piso"), d.pisoInput);
    const muroMats = d.muros.map(m => muro.materiales(sub(m.parte), m.input));
    const all = [pisoMat, ...muroMats];

    // perfiles: First-Fit GLOBAL sobre el conjunto (comparte sobrantes entre muros y con el piso).
    const { byProfile } = cutList(piezas);
    const perfiles = optimizeCuts(byProfile, cutOpts(input)).map(o => ({
      perfil: o.perfil, metros: +(byProfile[o.perfil].reduce((a, b) => a + b, 0) / 1000).toFixed(2),
      piezas: o.piezas, barras: o.bars, largoBarra: o.barLen, sobrantes: o.over
    }));

    // placas: sumar por material+cara → unidades de venta al final
    const pm = {};
    all.forEach(m => (m.placas || []).forEach(pl => {
      const k = pl.material + "|" + pl.cara;
      (pm[k] = pm[k] || { material: pl.material, cara: pl.cara, m2: 0 }).m2 += pl.m2;
    }));
    const placas = Object.values(pm).map(pl => ({ material: pl.material, cara: pl.cara, m2: +pl.m2.toFixed(2), unidades: Math.ceil(pl.m2 / 2.88) }));

    // otros (implantación del piso + carpintería de los muros): fusionar por key sumando cantidades
    const om = {};
    all.flatMap(m => m.otros || []).forEach(o => {
      (om[o.key] = om[o.key] || { ...o, cantidad: 0 }).cantidad += o.cantidad;
    });
    // El FLEJE viene en rollo: sumar los rollos ya redondeados de cada muro sobre-estima (4×1 rollo
    // para 47 m que entran en 2). Se recalcula GLOBAL desde todas las piezas, igual que los perfiles.
    const flejes = computeFlejes(piezas);
    const otros = Object.values(om).filter(o => o.key !== "fleje-rollo" && o.key !== "tensor");
    if (flejes){
      otros.push({ key:"fleje-rollo", label:`${FLEJE_PERFIL} galvanizado (rollo ${FLEJE.rollo/1000} m) — ${flejes.metros} m`,
        unidad:"rollo", cantidad: flejes.rollos });
      otros.push({ key:"tensor", label:"Tensor para fleje", unidad:"u", cantidad: flejes.tensores });
    }
    const aislacion = +all.reduce((a, m) => a + (m.aislacion || 0), 0).toFixed(2);
    const tornillos = { t1: all.reduce((a, m) => a + (m.tornillos?.t1 || 0), 0), t2: all.reduce((a, m) => a + (m.tornillos?.t2 || 0), 0) };
    const peso = +all.reduce((a, m) => a + (m.peso || 0), 0).toFixed(1);
    const nMont = muroMats.reduce((a, m) => a + (m.nMont || 0), 0);
    const nVanos = d.muros.reduce((a, m) => a + (m.input.vanos?.length || 0), 0);

    return { sistema: input.sistema, area: +(d.largo * d.ancho / 1e6).toFixed(2), peso, nMont, nVanos,
      perfiles, placas, aislacion, tornillos, otros, flejes, barLen: perfiles[0]?.largoBarra || 6000 };
  }
};

// Los 4 muros del ambiente con su largo real (para el editor de vanos en planta del wizard). El espesor
// se detecta de un muro vano-less (no afecta la profundidad). Frente/Fondo = largo; Izq/Der = ancho − 2·e.
export function murosDelAmbiente(input){
  const largo = +input.largo, ancho = +input.ancho, alto = +input.alto || 2600;
  const front = muro.generar({ sistema: input.sistema, largo, alto, vanos: [], opciones: input.opciones });
  const e = Math.round(boundsEngine(front.piezas).size[1]);
  const encaj = Math.max(ancho - 2 * e, 1);
  return [
    { parte: "frente", l: "Frente", largo }, { parte: "fondo", l: "Fondo", largo },
    { parte: "izq", l: "Lateral izq.", largo: encaj }, { parte: "der", l: "Lateral der.", largo: encaj }
  ];
}

// Optimización POR ETAPA vs GLOBAL (para el PDF de F9c y el test de ahorro de barras): cuántas barras
// usa cada perfil si se corta por etapa (piso, cada muro por separado) vs todo junto.
export function cortesPorEtapaVsGlobal(input){
  const d = descomponer(input);
  const etapas = [
    { parte: "piso", piezas: piso.generar(d.pisoInput).piezas },
    ...d.muros.map(m => ({ parte: m.parte, piezas: muro.generar(m.input).piezas }))
  ];
  const opts = cutOpts(input);
  const barsDe = piezas => optimizeCuts(cutList(piezas).byProfile, opts).reduce((a, o) => a + o.bars, 0);
  const porEtapa = etapas.reduce((a, e) => a + barsDe(e.piezas), 0);
  const global = barsDe(etapas.flatMap(e => e.piezas));
  return { porEtapa, global, ahorro: porEtapa - global };
}
