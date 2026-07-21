// Módulo constructivo: TECHO de cabriadas — Fase D.
//   'unAgua'   → cabriada MONOPENDIENTE sobre 4 muros de la misma altura (no toca el módulo Muro).
//   'dosAguas' → cabriada FINK (2 cordones superiores + la W de diagonales).
//
// Ejes del motor, en el conjunto: X = luz (lo que salva la cabriada) · Y = largo (reparto de
// cabriadas) · Z = altura, con el cordón inferior apoyado en z=0.
// Cada barra de la cabriada es una pieza DIAGONAL (`orient`, igual que el fleje de la Fase A): trae
// su base real {c,u,v,n,w,t} con el perfil DE CANTO en el plano de la cabriada (alma en el plano,
// ala perpendicular), que es como se arma en obra.
import { PGC, PGO, resolveSystem, cutOpts, FLEJE } from "../systems.mjs";
import { secDims } from "../geometry.mjs";
import { cutList, optimizeCuts } from "../cuts.mjs";
import { cruzEnPlano, computeFlejes } from "../brace.mjs";

export const PEND_MIN_CHAPA = 7;      // % — bajo esto la chapa puede filtrar (advertencia)
export const PERFIL_CORREA = "PGO 37x22x12.5";
const T1_POR_NODO = 4;                // tornillos por nodo de cabriada
const T1_POR_CRUCE = 2;               // correa ↔ cordón

const rad = g => g * Math.PI / 180;
export const anguloPendiente = pend => Math.atan((+pend || 0) / 100) * 180 / Math.PI;

// Barra entre dos puntos del plano de la cabriada (x,z), con la sección de canto.
// `offset` desplaza la barra perpendicular a su eje (para apoyar una cara sobre la línea de nodos).
function barra(tipo, perfil, a, b, y, sec, offset = 0){
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
  if (L < 1) return null;
  const u = [dx / L, 0, dz / L];
  const v = [-u[2], 0, u[0]];                 // perpendicular en el plano (dirección del alma)
  const cx = (a[0] + b[0]) / 2 + v[0] * offset;
  const cz = (a[1] + b[1]) / 2 + v[2] * offset;
  return { tipo, perfil, largo: Math.round(L), mat: "cabriada",
    orient: { c: [cx, y, cz], u, v, n: [0, 1, 0], w: sec.h, t: sec.b } };
}

// --- una cabriada, en su plano (y = posición a lo largo) --------------------------------------
// `sepMont` = separación de montantes (400 en las cabriadas de tímpano, 600 en las de campo).
export function cabriada(cfg, y, sepMont, conTimpano){
  const { tipo, luz, pendiente, alero, perfil } = cfg;
  const p = pendiente / 100, sec = secDims(perfil), h = sec.h;
  const P = [];
  const zTop = x => x * p;                                   // línea inferior del cordón superior
  // CORDÓN INFERIOR: horizontal, de apoyo a apoyo, con su cara superior en z=0.
  P.push(barra("CORDON_INFERIOR", perfil, [0, 0], [luz, 0], y, sec, -h / 2));

  if (tipo === "dosAguas"){
    const mitad = luz / 2, zc = mitad * p;                   // cumbrera
    // CORDONES SUPERIORES: del alero a la cumbrera; el alero se mide en HORIZONTAL.
    // En cumbrera cada cordón termina en el plano vertical central (no lo cruza).
    P.push(barra("CORDON_SUPERIOR", perfil, [-alero, -alero * p], [mitad, zc], y, sec, h / 2));
    P.push(barra("CORDON_SUPERIOR", perfil, [mitad, zc], [luz + alero, -alero * p], y, sec, h / 2));
    // La W de Fink: nodos inferiores a 1/3 y 2/3, nodos superiores en el medio de cada faldón.
    const ni1 = [luz / 3, 0], ni2 = [2 * luz / 3, 0];
    const ms1 = [luz / 4, (luz / 4) * p], ms2 = [3 * luz / 4, (luz / 4) * p];
    [[ms1, ni1], [ni1, [mitad, zc]], [[mitad, zc], ni2], [ni2, ms2]]
      .forEach(([a, b]) => P.push(barra("DIAGONAL", perfil, a, b, y, sec)));
    if (conTimpano){
      // montantes verticales del tímpano, del cordón inferior al superior
      for (let x = sepMont; x < luz; x += sepMont){
        const zt = x <= mitad ? zTop(x) : zTop(luz - x);
        if (zt > 10) P.push(barra("MONTANTE_TIMPANO", perfil, [x, 0], [x, zt], y, sec));
      }
    }
  } else {
    // UN AGUA: cordón superior inclinado con alero a ambos lados; su cara inferior pasa por la línea
    // de nodos (z = x·p), así el montante mide exactamente x·p.
    P.push(barra("CORDON_SUPERIOR", perfil, [-alero, zTop(-alero)], [luz + alero, zTop(luz + alero)], y, sec, h / 2));
    // Montante de cierre (lado alto) + montantes internos.
    P.push(barra("MONTANTE_CABRIADA", perfil, [luz, 0], [luz, zTop(luz)], y, sec));
    for (let x = sepMont; x < luz - 1; x += sepMont){
      const tipoM = conTimpano ? "MONTANTE_TIMPANO" : "MONTANTE_CABRIADA";
      if (zTop(x) > 10) P.push(barra(tipoM, perfil, [x, 0], [x, zTop(x)], y, sec));
    }
  }
  return P.filter(Boolean);
}

// Posiciones de las cabriadas: la primera y la última alineadas con los bordes del largo.
export function posCabriadas(largo, separacion){
  const n = Math.max(1, Math.ceil(largo / separacion));
  return Array.from({ length: n + 1 }, (_, i) => Math.round(largo * i / n));
}

// Posiciones de correas sobre un faldón, medidas A LO LARGO DE LA PENDIENTE: una en cada borde e
// intermedias repartidas parejo con separación ≤ sepCorreas.
export function posCorreas(largoFaldon, sepCorreas){
  const n = Math.max(1, Math.ceil(largoFaldon / sepCorreas));
  return Array.from({ length: n + 1 }, (_, i) => +(largoFaldon * i / n).toFixed(1));
}

function normalizar(input){
  const tipo = input.tipo === "dosAguas" ? "dosAguas" : "unAgua";
  const s = resolveSystem(input);
  return {
    tipo,
    luz: +input.luz || 3000,
    largo: +input.largo || 4000,
    pendiente: +input.pendiente || (tipo === "dosAguas" ? 30 : 15),
    alero: input.alero == null ? 400 : +input.alero,
    separacion: +input.separacion || 600,
    sepCorreas: +input.sepCorreas || 1000,
    perfil: PGC[input.opciones?.pgc] ? input.opciones.pgc : "PGC 100x0.90",
    perfilCorrea: PERFIL_CORREA,
    timpanos: input.timpanos !== false,
    cubierta: input.cubierta !== false,
    caida: input.caida || "frente",
    moduloMuro: +input.moduloMuro || 0,   // sólo lo pasa el Ambiente, para el aviso de in-line framing
    _s: s
  };
}

export const techo = {
  id: "techo",
  nombre: "Techo",
  descripcion: "Cabriadas a un agua o dos aguas.",
  icono: "🏚️",

  defaults(){
    return { tipo: "unAgua", luz: 3000, largo: 4000, pendiente: 15, alero: 400,
      separacion: 600, sepCorreas: 1000, timpanos: true, cubierta: true, caida: "frente",
      sistema: "steel", opciones: { pgc: "PGC 100x0.90", pgu: "PGU 100x0.90" } };
  },

  schema: {
    pasos: [
      { id: "tipo", titulo: "Tipo", campos: [
        { k: "tipo", tipo: "cards", label: "¿Cómo cae el agua?", opciones: [
          { v: "unAgua", titulo: "Un agua", desc: "Una sola pendiente. El típico de una ampliación o un quincho." },
          { v: "dosAguas", titulo: "Dos aguas", desc: "Dos faldones con cumbrera al medio, tipo casita." }
        ], onSet: (p, v) => { p.pendiente = v === "dosAguas" ? 30 : 15; } }
      ]},
      { id: "medidas", titulo: "Medidas", campos: [
        { k: "luz", tipo: "medida", label: "Luz (lo que cruza la cabriada)", rango: [2000, 12000] },
        { k: "largo", tipo: "medida", label: "Largo del techo", rango: [1000, 20000] }
      ], avanzado: [
        { k: "alero", tipo: "medida", label: "Alero", rango: [0, 1200] },
        { k: "separacion", tipo: "seg", label: "Separación de cabriadas",
          opciones: [{ v: 400, l: "400 mm" }, { v: 600, l: "600 mm" }, { v: 1200, l: "1200 mm" }] },
        { k: "timpanos", tipo: "seg", label: "Tímpanos (cerrar los extremos)", opciones: [{ v: true, l: "Sí" }, { v: false, l: "No" }] },
        { k: "cubierta", tipo: "seg", label: "Chapa de cubierta", opciones: [{ v: true, l: "Sí" }, { v: false, l: "No" }] },
        { tipo: "perfil" }
      ]},
      { id: "pendiente", titulo: "Pendiente", campos: [
        // Lenguaje llano: la pendiente en % con presets de obra. Bajo 7 % la chapa puede filtrar.
        { k: "pendiente", tipo: "seg", label: "Pendiente (para chapa: mínimo 7 %, recomendado 15 %)",
          opciones: [{ v: 7, l: "7 % (mínima)" }, { v: 15, l: "15 % (recomendada)" }, { v: 30, l: "30 %" }, { v: 50, l: "50 %" }] },
        { k: "caida", tipo: "seg", label: "¿Hacia dónde cae el agua?",
          opciones: [{ v: "frente", l: "Frente" }, { v: "fondo", l: "Fondo" }, { v: "izq", l: "Izq." }, { v: "der", l: "Der." }] }
      ]}
    ]
  },

  generar(input){
    const c = normalizar(input);
    const P = [], avisos = [];
    const p = c.pendiente / 100, ang = anguloPendiente(c.pendiente);
    const cos = Math.cos(rad(ang));
    const secC = secDims(c.perfilCorrea);

    // --- CABRIADAS ---
    const ys = posCabriadas(c.largo, c.separacion);
    ys.forEach((y, i) => {
      const extrema = i === 0 || i === ys.length - 1;
      const conTimpano = c.timpanos && extrema;
      P.push(...cabriada(c, y, conTimpano ? 400 : 600, conTimpano));
    });

    // --- FALDONES ---
    // `zNodo` = altura de la línea de nodos (cara inferior del cordón superior) en cada x. En dos
    // aguas sube hasta la cumbrera y baja: min(x, luz−x)·p, que también vale para los aleros (negativo).
    const sen = Math.sin(rad(ang)), hC = secDims(c.perfil).h;
    const zNodo = x => (c.tipo === "dosAguas" ? Math.min(x, c.luz - x) : x) * p;
    // Cada faldón con su base en el plano inclinado: `s` sube por la pendiente, `t` corre a lo largo.
    const faldones = c.tipo === "dosAguas"
      ? [{ xIni: -c.alero, s: [ cos, 0,  sen], largoF: (c.luz/2 + c.alero)/cos },
         { xIni: c.luz + c.alero, s: [-cos, 0,  sen], largoF: (c.luz/2 + c.alero)/cos }]
      : [{ xIni: -c.alero, s: [ cos, 0,  sen], largoF: (c.luz + 2*c.alero)/cos }];
    const T = [0, 1, 0];                                  // dirección del largo del techo
    const puntoFaldon = (f, d, subir) => {                // punto sobre el faldón a distancia d del borde bajo
      const x = f.xIni + f.s[0] * d;
      return [x, 0, zNodo(x) + subir];
    };

    // --- CORREAS: perpendiculares a las cabriadas (corren en Y), apoyadas sobre los cordones ---
    faldones.forEach(f => posCorreas(f.largoF, c.sepCorreas).forEach(d => {
      const [x, , z] = puntoFaldon(f, d, hC + secC.h / 2);
      P.push({ tipo: "CORREA", perfil: c.perfilCorrea, largo: Math.round(c.largo), mat: "correa",
        orient: { c: [x, c.largo/2, z], u: T, v: [0,0,1], n: [1,0,0], w: secC.h, t: secC.b } });
    }));

    // --- ARRIOSTRAMIENTO del plano de cubierta: 1 cruz de flejes por faldón (misma regla que Fase A,
    //     pero tumbada EN EL PLANO DEL FALDÓN: `s` (pendiente) × `t` (largo) ---
    const nrm = f => [ -f.s[2], 0, f.s[0] ];              // normal al faldón (s × t)
    faldones.forEach(f => {
      const cr = cruzEnPlano(f.largoF, c.largo);
      avisos.push(...cr.avisos.map(a => `Faldón del techo: ${a}`));
      const n = nrm(f);
      cr.zonas.forEach(z => {
        const L = Math.hypot(z.ancho, z.alto);
        [1, -1].forEach((sentido, k) => {
          const a = z.ancho / L, b = sentido * z.alto / L;              // componentes en (s, t)
          const u = [0,1,2].map(i => a * f.s[i] + b * T[i]);            // eje del fleje, en el plano
          const v = [0,1,2].map(i => -b * f.s[i] + a * T[i]);           // ancho del fleje, en el plano
          const [x, , zc] = puntoFaldon(f, z.x0 + z.ancho/2, hC + FLEJE.esp * (k + 1));
          P.push({ tipo: "FLEJE", categoria: "fleje", perfil: `Fleje ${FLEJE.ancho}x${FLEJE.esp}`, mat: "fleje",
            largo: Math.round(L),
            orient: { c: [x, c.largo/2, zc], u, v, n, w: FLEJE.ancho, t: FLEJE.esp } });
        });
      });
    });

    // --- CUBIERTA: capa visual por faldón (m² al cómputo, sin despiece de chapas) ---
    if (c.cubierta) faldones.forEach(f => {
      const [x, , z] = puntoFaldon(f, f.largoF / 2, hC + 20);
      P.push({ tipo: "CUBIERTA", perfil: "Chapa", largo: Math.round(f.largoF), superficie: true, capa: "cubierta",
        mat: "chapa", box: { size: [Math.abs(f.s[0]) * f.largoF, c.largo, 6], center: [x, c.largo/2, z] } });
    });

    // --- ADVERTENCIAS ---
    if (c.pendiente < PEND_MIN_CHAPA)
      avisos.push(`Pendiente ${c.pendiente} %: con menos de ${PEND_MIN_CHAPA} % la chapa puede filtrar. Revisalo antes de comprar.`);
    if (c.moduloMuro && c.separacion !== c.moduloMuro)
      avisos.push("Cabriadas no alineadas con montantes: verificar transmisión de cargas con un profesional.");

    const alturaCumbrera = (c.tipo === "dosAguas" ? c.luz/2 : c.luz) * p;
    return { piezas: P, metadatos: { nombre: "Techo", esquema: "cabriada", sistema: input.sistema,
      tipo: c.tipo, luz: c.luz, largo: c.largo, pendiente: c.pendiente, angulo: +ang.toFixed(2),
      alero: c.alero, alturaCumbrera: Math.round(alturaCumbrera), nCabriadas: ys.length,
      faldones: faldones.map(f => Math.round(f.largoF)), avisos,
      vistas: [{ id: "frontal", l: "Cabriada" }, { id: "iso", l: "Conjunto" }], vistaDefault: "iso" } };
  },

  materiales(piezas, input){
    const c = normalizar(input);
    const opts = cutOpts(input);
    const { byProfile } = cutList(piezas);
    const perfiles = optimizeCuts(byProfile, opts).map(o => ({
      perfil: o.perfil, metros: +(byProfile[o.perfil].reduce((a, b) => a + b, 0) / 1000).toFixed(2),
      piezas: o.piezas, barras: o.bars, largoBarra: o.barLen, sobrantes: o.over
    }));

    const nCabriadas = new Set(piezas.filter(p => p.tipo === "CORDON_INFERIOR").map(p => p.orient.c[1])).size;
    const nCorreas = piezas.filter(p => p.tipo === "CORREA").length;
    const nodosPorCabriada = c.tipo === "dosAguas" ? 7 : 4;
    const otros = [];

    // cubierta: m² por faldón (sin despiece) + cumbrera en dos aguas
    const cos = Math.cos(rad(anguloPendiente(c.pendiente)));
    const faldonL = c.tipo === "dosAguas" ? (c.luz/2 + c.alero)/cos : (c.luz + 2*c.alero)/cos;
    const nFald = c.tipo === "dosAguas" ? 2 : 1;
    const m2 = +(faldonL * c.largo * nFald / 1e6).toFixed(2);
    if (c.cubierta){
      otros.push({ key: "chapa", label: "Chapa de cubierta", unidad: "m²", cantidad: Math.ceil(m2) });
      if (c.tipo === "dosAguas") otros.push({ key: "cumbrera", label: "Cumbrera (babeta)", unidad: "m", cantidad: +(c.largo/1000).toFixed(2) });
    }
    // arriostramiento (mismos ítems que la Fase A)
    const fl = computeFlejes(piezas);
    if (fl){
      otros.push({ key: "fleje-rollo", label: `Fleje ${FLEJE.ancho}x${FLEJE.esp} galvanizado (rollo ${FLEJE.rollo/1000} m) — ${fl.metros} m`, unidad: "rollo", cantidad: fl.rollos });
      otros.push({ key: "tensor", label: "Tensor para fleje", unidad: "u", cantidad: fl.tensores });
    }

    const t1 = nCabriadas * nodosPorCabriada * T1_POR_NODO
      + nCorreas * nCabriadas * T1_POR_CRUCE + (fl ? fl.t1 : 0);

    const kgM = PGC[c.perfil]?.kg || 0;
    const peso = piezas.reduce((a, p) => a + (p.superficie || p.categoria === "fleje" ? 0
      : (p.largo/1000) * (p.tipo === "CORREA" ? PGO.kg : kgM)), 0);

    return { sistema: input.sistema, area: m2, peso: +peso.toFixed(1),
      nCabriadas, nCorreas, nVanos: 0, perfiles, placas: [], aislacion: 0, otros,
      tornillos: { t1, t2: 0 }, barLen: perfiles[0]?.largoBarra || 6000 };
  }
};
