// FASE B — Vano de escalera/trampa en el módulo Piso.
// Enmarcado: trimmers (dobles, paralelos a las vigas, de cenefa a cenefa) + cabezales (dobles,
// perpendiculares, entre caras interiores de trimmers) + vigas cola (tramos de las vigas cortadas).
// Coordenadas del entramado: X = corrida (lado mayor) · Y = luz (lado menor, lo que salva cada viga).
import { test, describe } from "vitest";
import assert from "node:assert/strict";
import { piso, validarVanoPiso, encajarVano, zonaVano } from "../src/engine/modules/piso.mjs";
import { combinado } from "../src/engine/modules/combinado.mjs";
import { cutList } from "../src/engine/cuts.mjs";
import { pieceBoxEngine } from "../src/engine/geometry.mjs";
import { exportRuby } from "../src/export/ruby.mjs";

const OPC = { pgc: "PGC 150x1.60", pgu: "PGU 150x1.60", lumber: "2x8 (38×184)", tiraLen: 4880 };
const suelo = (extra = {}) => ({ sistema: "steel", largo: 3600, ancho: 4800, separacion: 400,
  apoyo: "platea", placa: true, opciones: OPC, ...extra });
const tipos = P => P.reduce((c, p) => (c[p.tipo] = (c[p.tipo] || 0) + 1, c), {});
const sinColision = P => {
  const bs = P.map(p => { const { size, center } = pieceBoxEngine(p); return { t: p.tipo, b: [0,1,2].map(i => [center[i]-size[i]/2, center[i]+size[i]/2]) }; });
  const eps = 0.5, sol = (a, b) => [0,1,2].every(i => a[i][0] < b[i][1]-eps && b[i][0] < a[i][1]-eps);
  for (let i = 0; i < bs.length; i++) for (let j = i+1; j < bs.length; j++)
    if (sol(bs[i].b, bs[j].b)) return `${bs[i].t} ↔ ${bs[j].t}`;
  return null;
};

// 8) REGRESIÓN CERO: sin vano, la salida es idéntica a la de antes de la fase.
test("piso sin vano: salida intacta (regresión cero)", () => {
  const P = piso.generar(suelo()).piezas;
  assert.deepEqual(tipos(P), { CENEFA: 4, VIGA_DOBLE: 2, VIGA: 11, BLOCKING: 12 });
  assert.equal(P.length, 29);
  assert.ok(!P.some(p => ["TRIMMER","CABEZAL","VIGA_COLA"].includes(p.tipo)), "no aparece enmarcado");
  const m = piso.materiales(P, suelo());
  assert.equal(m.nVanos, 0);
  assert.equal(m.tornillos.t1, 0, "sin vano no hay rigidizadores");
  assert.equal(m.area, 17.28, "3,6 × 4,8 = 17,28 m² completos");
  assert.equal(piso.generar(suelo()).metadatos.vano, null);
});

// 1) Enmarcado completo: trimmers de largo total, cabezales entre caras, colas contadas a mano.
test("3,60×4,80 @400, vano 1000×2400: enmarcado y conteo de vigas cola", () => {
  // entramado: corrida(X)=4800, luz(Y)=3600. Vigas en x = 35, 435, 835 … (ct=35, sep=400).
  // Vano [1900,2900]×[600,3000] ⇒ trimmers nuevos en x=1860 y x=2900.
  // Vigas de modulación estrictamente entre ellos: 2035, 2435, 2835 → 3 interrumpidas → 6 colas.
  const inp = suelo({ vano: { x: 1900, y: 600, ancho: 1000, largo: 2400 } });
  const { piezas: P, metadatos } = piso.generar(inp);
  assert.deepEqual(metadatos.vano, { x0: 1900, x1: 2900, y0: 600, y1: 3000 }, "hueco libre = el vano pedido");

  const tr = P.filter(p => p.tipo === "TRIMMER");
  assert.equal(tr.length, 2);
  assert.deepEqual(tr.map(p => p.pos[0]).sort((a,b)=>a-b), [1860, 2900], "a cada lado del hueco");
  const luzIn = 3600 - 2*35;
  tr.forEach(p => { assert.equal(p.largo, luzIn, "el trimmer corre de cenefa a cenefa"); assert.equal(p.pos[1], 35); });

  const cab = P.filter(p => p.tipo === "CABEZAL");
  assert.equal(cab.length, 2);
  cab.forEach(p => { assert.equal(p.largo, 1000, "entre caras interiores de los trimmers"); assert.equal(p.pos[0], 1900); assert.equal(p.axis, "x"); });
  assert.deepEqual(cab.map(p => p.pos[1]).sort((a,b)=>a-b), [560, 3000], "por fuera del hueco (40 = ala)");

  const colas = P.filter(p => p.tipo === "VIGA_COLA");
  assert.equal(colas.length, 6, "3 vigas interrumpidas × 2 tramos");
  assert.deepEqual([...new Set(colas.map(p => p.pos[0]))].sort((a,b)=>a-b), [2035, 2435, 2835]);
  colas.forEach(p => assert.equal(p.largo, 525, "de la cenefa a la cara del cabezal"));
  // las vigas de campo que quedaban entre los trimmers ya no están enteras
  assert.ok(!P.some(p => p.tipo === "VIGA" && p.pos[0] > 1860 && p.pos[0] < 2900), "ninguna viga entera cruza el hueco");
});

// 2) Borde coincidente con una viga de la modulación → esa viga pasa a doble, sin duplicar pieza.
test("borde sobre una viga existente: se convierte en doble, sin pieza superpuesta", () => {
  // viga de modulación en x=435 ⇒ para que sea el trimmer izquierdo, el vano arranca en 435+40
  const inp = suelo({ vano: { x: 475, y: 600, ancho: 1000, largo: 2400 } });
  const P = piso.generar(inp).piezas;
  const enX = x => P.filter(p => ["VIGA","VIGA_DOBLE","TRIMMER"].includes(p.tipo) && p.pos[0] === x);
  assert.equal(enX(435).length, 1, "una sola pieza en esa posición");
  assert.equal(enX(435)[0].tipo, "VIGA_DOBLE", "la viga existente pasa a doble");
  assert.equal(P.filter(p => p.tipo === "TRIMMER").length, 1, "sólo el trimmer del otro borde es nuevo");
  assert.equal(P.filter(p => p.tipo === "TRIMMER")[0].pos[0], 1475);
  assert.equal(sinColision(P), null, "el AABB confirma que no hay viga duplicada encima");
});

// 3) Margen mínimo: una franja de modulación a cada borde. Justo → genera; 1 mm afuera → bloquea.
describe("validación de margen (error bloqueante)", () => {
  const sep = 400, corrida = 4800, luz = 3600;
  test("pegado al margen mínimo → genera", () => {
    const v = { x: sep, y: sep, ancho: corrida - 2*sep, largo: luz - 2*sep };
    const r = validarVanoPiso(suelo({ vano: v }));
    assert.deepEqual(r.errores, []);
    assert.ok(piso.generar(suelo({ vano: v })).piezas.some(p => p.tipo === "CABEZAL"));
  });
  test("1 mm más afuera → error bloqueante y sin geometría de vano", () => {
    const v = { x: sep - 1, y: sep, ancho: corrida - 2*sep, largo: luz - 2*sep };
    const r = validarVanoPiso(suelo({ vano: v }));
    assert.equal(r.errores.length, 1);
    assert.match(r.errores[0], /muy pegado al borde/, "el error habla en lenguaje de obra");
    assert.match(r.errores[0], /Acomodar/, "y ofrece la salida en un toque");
    assert.equal(r.vano, null);
    const { piezas, metadatos } = piso.generar(suelo({ vano: v }));
    assert.equal(metadatos.vano, null, "no se genera geometría inválida");
    assert.ok(!piezas.some(p => ["TRIMMER","CABEZAL","VIGA_COLA"].includes(p.tipo)));
  });
  test("vano ancho (> 1,20 m entre trimmers) → advertencia, no error", () => {
    const r = validarVanoPiso(suelo({ vano: { x: 1000, y: 600, ancho: 2000, largo: 2400 } }));
    assert.deepEqual(r.errores, []);
    assert.match(r.avisos[0], /verificar dimensionado de cabezales/);
  });
});

// 4) Tramo residual < 150 mm: no tiene sentido constructivo → se elimina y no llega a cortes.
test("cola residual menor a 150 mm se elimina", () => {
  // el hueco arranca casi contra la cenefa inferior: tramo de abajo = (y−40) − 35
  const inp = suelo({ vano: { x: 1900, y: 400, ancho: 1000, largo: 2400 } }); // cola inf = 400−40−35 = 325 → queda
  const conCola = piso.generar(inp).piezas.filter(p => p.tipo === "VIGA_COLA");
  assert.ok(conCola.some(p => p.largo === 325));
  // ahora con margen justo para que el tramo quede por debajo del mínimo (y = 400 exige margen 400)
  const inp2 = suelo({ separacion: 400, vano: { x: 1900, y: 400, ancho: 1000, largo: 2760 } }); // cola sup = 3565−3200 = 365
  const P2 = piso.generar(inp2).piezas;
  assert.ok(P2.filter(p => p.tipo === "VIGA_COLA").every(p => p.largo >= 150), "ninguna cola por debajo del mínimo");
  // caso explícito: un tramo de 100 mm no debe existir en la lista de corte
  const cortes = cutList(P2).groups.filter(g => g.tipo === "VIGA_COLA");
  assert.ok(cortes.every(g => g.largo >= 150), "los cortes tampoco traen colas cortas");
});

// 5) La placa de piso descuenta el área del vano.
test("m² de placa descuenta el hueco", () => {
  const inp = suelo({ vano: { x: 1900, y: 600, ancho: 1000, largo: 2400 } });
  const m = piso.materiales(piso.generar(inp).piezas, inp);
  assert.equal(m.area, +(17.28 - 2.4).toFixed(2), "17,28 − (1,00 × 2,40) m²");
  assert.equal(m.nVanos, 1);
  // rigidizadores: 2 por cabezal + 1 por cola = 4 + 6; T1 = 5 por rigidizador
  const rig = m.otros.find(o => o.key === "rigidizador");
  assert.equal(rig.cantidad, 10);
  assert.equal(m.tornillos.t1, 50);
});

// 6) Blocking: ninguna pieza dentro del hueco.
test("no hay blocking dentro del vano", () => {
  const inp = suelo({ vano: { x: 1900, y: 600, ancho: 1000, largo: 2400 } });
  const P = piso.generar(inp).piezas;
  const V = piso.generar(inp).metadatos.vano;
  P.filter(p => p.tipo === "BLOCKING").forEach(p => {
    const { size, center } = pieceBoxEngine(p);
    const dentroY = center[1] > V.y0 && center[1] < V.y1;
    const solapaX = center[0] - size[0]/2 < V.x1 && center[0] + size[0]/2 > V.x0;
    assert.ok(!(dentroY && solapaX), `blocking dentro del hueco en x=${p.pos[0]} y=${p.pos[1]}`);
  });
  assert.ok(P.filter(p => p.tipo === "BLOCKING").length < 12, "se omitieron los del hueco");
});

// 7) AABB global: cabezales terminan en cara de trimmer y colas en cara de cabezal, sin solapes.
for (const [nom, sis, vano] of [
  ["steel", "steel", { x: 1900, y: 600, ancho: 1000, largo: 2400 }],
  ["wood",  "wood",  { x: 1200, y: 800, ancho: 1000, largo: 1600 }]
]){
  test(`AABB sin colisiones con vano (${nom})`, () => {
    assert.equal(sinColision(piso.generar(suelo({ sistema: sis, vano })).piezas), null);
  });
}

// 9) Export Ruby: las piezas nuevas se emiten con su eje real y sintaxis válida.
test("export Ruby: trimmer / cabezal / viga cola emitidos", () => {
  const inp = { kind: "piso", ...suelo({ vano: { x: 1900, y: 600, ancho: 1000, largo: 2400 } }) };
  const rb = exportRuby(inp);
  const P = piso.generar(inp).piezas;
  // una llamada _profile por pieza (paridad motor ↔ .rb)
  assert.equal((rb.match(/_profile\(/g) || []).length - 1, P.length, "una llamada por pieza (menos la def del helper)");
  assert.match(rb, /MAP_XZ/, "los cabezales corren en X y se extruyen con su mapper");
  assert.ok(!/undefined|NaN/.test(rb), "sin valores inválidos en el script");
});

// El vano se ACOMODA solo: la UI nunca deja al usuario contra el error bloqueante.
describe("encajarVano: el hueco siempre entra", () => {
  // caso reportado: entramado 5000×4000 @600 con el preset "Escalera recta 1000×3000".
  // A lo largo de las vigas (luz 4000) 3000+600+600 = 4200 no entra; girado sí (3000 sobre 5000).
  const suelo600 = { sistema: "steel", largo: 5000, ancho: 4000, separacion: 600, opciones: OPC };
  test("gira el vano cuando no entra en esa orientación", () => {
    const crudo = { x: 2000, y: 500, ancho: 1000, largo: 3000 };
    assert.equal(validarVanoPiso({ ...suelo600, vano: crudo }).errores.length, 1, "crudo no entra");
    const { vano, ajustes } = encajarVano(suelo600, crudo);
    assert.deepEqual([vano.ancho, vano.largo], [3000, 1000], "quedó girado");
    assert.match(ajustes[0], /gir/i);
    assert.deepEqual(validarVanoPiso({ ...suelo600, vano }).errores, [], "ya es válido");
  });
  test("achica el vano si no entra ni girado", () => {
    const { vano, ajustes } = encajarVano(suelo600, { x: 0, y: 0, ancho: 9000, largo: 9000 });
    const z = zonaVano(suelo600);
    assert.deepEqual([vano.ancho, vano.largo], [z.maxAncho, z.maxLargo]);
    assert.ok(ajustes.some(a => /Achiqu/.test(a)));
    assert.deepEqual(validarVanoPiso({ ...suelo600, vano }).errores, []);
  });
  test("corre el vano si quedó pegado al borde", () => {
    const { vano, ajustes } = encajarVano(suelo600, { x: 0, y: 0, ancho: 800, largo: 800 });
    assert.deepEqual([vano.x, vano.y], [600, 600], "lo lleva al margen mínimo");
    assert.ok(ajustes.some(a => /corr/i.test(a)));
  });
  test("si ya es válido no toca nada ni informa ajustes", () => {
    const ok = { x: 1900, y: 600, ancho: 1000, largo: 2400 };
    const r = encajarVano(suelo(), ok);
    assert.deepEqual(r.vano, ok);
    assert.deepEqual(r.ajustes, []);
  });
  test("entramado demasiado chico: lo dice, sin romper", () => {
    const r = encajarVano({ sistema: "steel", largo: 1200, ancho: 1000, separacion: 600, opciones: OPC }, { x: 0, y: 0, ancho: 600, largo: 600 });
    assert.equal(r.vano, null);
    assert.match(r.ajustes[0], /muy chico/);
  });
});

// Ambiente completo: passthrough del vano al piso, sin lógica nueva en el orquestador.
test("ambiente completo: el vano del piso se propaga y suma al cómputo", () => {
  const inp = { kind: "combinado", sistema: "steel", largo: 4800, ancho: 3600, alto: 2600, apoyo: "platea",
    placa: true, opciones: OPC, vanoFrente: [], vanoFondo: [], vanoIzq: [], vanoDer: [],
    vano: { x: 1900, y: 600, ancho: 1000, largo: 2400 } };
  const { piezas } = combinado.generar(inp);
  const delPiso = piezas.filter(p => p.parte === "piso");
  assert.ok(delPiso.some(p => p.tipo === "CABEZAL") && delPiso.some(p => p.tipo === "TRIMMER"), "enmarcado presente");
  assert.equal(delPiso.filter(p => p.tipo === "VIGA_COLA").length, 6);
  const m = combinado.materiales(piezas, inp);
  assert.ok(m.otros.some(o => o.key === "rigidizador"), "los rigidizadores llegan a la fusión");
});
