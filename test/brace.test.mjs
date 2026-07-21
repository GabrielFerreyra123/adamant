// FASE A — Arriostramiento: Cruz de San Andrés (fleje galvanizado).
// Regla constructiva: 2 diagonales por cruz sobre la cara exterior, atornilladas SÓLO en los extremos
// (4 T1 por extremo), 1 tensor por fleje, ángulo válido 30°–60° respecto de la horizontal.
import { test, describe } from "vitest";
import assert from "node:assert/strict";
import { buildBraces, tramosLlenos, anguloGrados, computeFlejes } from "../src/engine/brace.mjs";
import { muro } from "../src/engine/modules/muro.mjs";
import { combinado } from "../src/engine/modules/combinado.mjs";
import { cutList, cutPlan } from "../src/engine/cuts.mjs";
import { cutOpts, FLEJE } from "../src/engine/systems.mjs";
import { pieceBoxEngine } from "../src/engine/geometry.mjs";
import { exportRuby } from "../src/export/ruby.mjs";

const OPC = { pgc: "PGC 100x0.90", pgu: "PGU 100x0.90", lumber: "2x6 (38×140)", modulo: 400 };
const pared = (largo, alto, extra = {}) => ({ sistema: "steel", largo, alto, opciones: OPC, vanos: [], arriostramiento: "cruz", ...extra });
const flejesDe = piezas => piezas.filter(p => p.categoria === "fleje");
const hip = (a, b) => Math.round(Math.hypot(a, b));

// 1) Largo del fleje = hipotenusa exacta de su zona (sin vanos y con vanos).
describe("largo = hipotenusa de la zona", () => {
  test("muro sin vanos: la zona es el muro completo", () => {
    const { piezas } = buildBraces(pared(3000, 2600));
    assert.equal(piezas.length, 2, "una cruz = 2 flejes");
    piezas.forEach(p => assert.equal(p.largo, hip(3000, 2600), "hipotenusa de 3000×2600"));
  });
  test("muro con vano: la zona es el tramo lleno elegido", () => {
    // vano 1000–2000 sobre 5000 → tramos [0,1000] y [2000,5000]; gana el de 3000
    const { piezas, zonas } = buildBraces(pared(5000, 2600, { vanos: [{ x1: 1000, x2: 2000, h: 2050, sill: 0 }] }));
    assert.equal(zonas[0].ancho, 3000);
    piezas.forEach(p => assert.equal(p.largo, hip(3000, 2600)));
  });
});

// 2) Subdivisión: zona muy ancha → N sub-tramos para que el ángulo entre en rango.
test("6,00 × 2,60 m sin vanos → 23,4° → 2 cruces de 3,00 m a 40,9°", () => {
  assert.equal(+anguloGrados(6000, 2600).toFixed(1), 23.4, "ángulo de la zona completa");
  const { piezas, zonas } = buildBraces(pared(6000, 2600));
  assert.equal(zonas.length, 2, "se subdivide en 2 sub-tramos");
  assert.deepEqual(zonas.map(z => z.ancho), [3000, 3000]);
  assert.deepEqual(zonas.map(z => z.angulo), [40.9, 40.9], "cada cruz queda en el rango 30–60°");
  assert.equal(piezas.length, 4, "2 cruces × 2 flejes");
  piezas.forEach(p => assert.equal(p.largo, hip(3000, 2600)));
});

// 3) Zona angosta: se coloca igual, con advertencia (no hay subdivisión que baje el ángulo).
test("1,20 × 2,60 m → 65,2° → 1 cruz + advertencia", () => {
  const { piezas, zonas, avisos } = buildBraces(pared(1200, 2600));
  assert.equal(zonas.length, 1); assert.equal(piezas.length, 2);
  assert.equal(zonas[0].angulo, 65.2);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /65\.2°.*30–60°/, "la advertencia informa el ángulo y el rango");
});

// 4) Con vanos: la cruz va al tramo lleno MÁS ANCHO; el límite es el king (se descuenta [x1,x2]).
describe("elección del tramo", () => {
  test("vano descentrado → gana el tramo mayor", () => {
    const { zonas } = buildBraces(pared(5000, 2600, { vanos: [{ x1: 1000, x2: 2000, h: 2050, sill: 0 }] }));
    assert.equal(zonas[0].x0, 2000, "arranca donde termina el vano (cara del king)");
    assert.equal(zonas[0].ancho, 3000);
  });
  test("tramos llenos = complemento de los vanos", () => {
    assert.deepEqual(tramosLlenos(5000, [{ x1: 1000, x2: 2000 }]), [[0, 1000], [2000, 5000]]);
    assert.deepEqual(tramosLlenos(3000, []), [[0, 3000]]);
  });
  test("sin tramo lleno suficiente (< 400 mm) → sin cruz + advertencia", () => {
    const { piezas, avisos } = buildBraces(pared(2000, 2600, { vanos: [{ x1: 300, x2: 1800, h: 2050, sill: 0 }] }));
    assert.equal(piezas.length, 0);
    assert.match(avisos[0], /Sin tramo lleno suficiente/);
  });
});

// 5) Cortes: derivan de piezas[] y NO entran al bin-packing de barras (el fleje viene en rollo).
test("los flejes salen de piezas[] y quedan fuera del empaquetado de barras", () => {
  const inp = pared(6000, 2600);
  const piezas = muro.generar(inp).piezas;
  const { groups, byProfile } = cutList(piezas);
  const gF = groups.filter(g => g.categoria === "fleje");
  assert.ok(gF.length, "el fleje aparece en la lista de corte");
  assert.equal(gF.reduce((a, g) => a + g.cant, 0), 4, "4 flejes");
  assert.ok(!Object.keys(byProfile).some(k => /Fleje/.test(k)), "no hay perfil de fleje en el bin-packing");

  const plan = cutPlan(piezas, cutOpts(inp));
  const sec = plan.find(s => s.fleje);
  assert.ok(sec, "hay sección FLEJES");
  assert.equal(sec.piezas, 4);
  assert.equal(sec.metros, +(4 * hip(3000, 2600) / 1000).toFixed(2), "metros = suma de largos");
  assert.equal(sec.rollos, Math.ceil(4 * hip(3000, 2600) / FLEJE.rollo));
  assert.equal(sec.bins, undefined, "la sección de rollo no tiene barras");
  assert.ok(!plan.filter(s => !s.fleje).some(s => s.bins.some(b => b.items.some(i => i.tipo === "FLEJE"))),
    "ningún fleje se coló en una barra");
});

// 6) AABB: el fleje va APOYADO sobre la cara exterior, fuera del frame (por eso se exime del test de
//    colisión: su caja alineada a los ejes es mucho mayor que la chapa y se solapa con la otra diagonal).
test("el fleje queda fuera del frame y su AABB refleja la chapa diagonal", () => {
  const piezas = muro.generar(pared(3000, 2600)).piezas;
  const frame = piezas.filter(p => p.categoria !== "fleje");
  const yMinFrame = Math.min(...frame.map(p => { const b = pieceBoxEngine(p); return b.center[1] - b.size[1]/2; }));
  flejesDe(piezas).forEach(p => {
    const b = pieceBoxEngine(p);
    assert.ok(b.center[1] + b.size[1]/2 <= yMinFrame + 1e-6, "el fleje no penetra el entramado");
    assert.ok(Math.abs(b.size[1] - FLEJE.esp) < 1e-6, "espesor de la chapa en Y");
  });
  // las dos diagonales se cruzan: comparten el centro del paño y van a distinta profundidad
  const [a, b] = flejesDe(piezas);
  assert.equal(a.orient.c[0], b.orient.c[0]); assert.equal(a.orient.c[2], b.orient.c[2]);
  assert.notEqual(a.orient.c[1], b.orient.c[1], "una montada sobre la otra (sin intersección real)");
});

// 7) Ambiente completo: 4 muros con cruz → materiales fusionados suman todos los flejes/tensores/T1.
test("ambiente completo: flejes de los 4 muros fusionados (rollos calculados global)", () => {
  const inp = { kind: "combinado", sistema: "steel", largo: 5000, ancho: 4000, alto: 2600, apoyo: "platea",
    placa: true, opciones: OPC, vanoFrente: [], vanoFondo: [], vanoIzq: [], vanoDer: [] };
  const { piezas } = combinado.generar(inp);
  const fl = flejesDe(piezas);
  // frente/fondo 5000 → 2 cruces c/u; izq/der (4000−2e) → 1 cruz c/u  ⇒ 4+4+2+2 = 12 flejes
  assert.equal(fl.length, 12);
  assert.deepEqual([...new Set(fl.map(p => p.parte))].sort(), ["der", "fondo", "frente", "izq"]);

  const m = combinado.materiales(piezas, inp);
  const c = computeFlejes(piezas);
  assert.equal(m.flejes.unidades, 12);
  assert.equal(m.otros.find(o => o.key === "tensor").cantidad, 12, "1 tensor por fleje");
  assert.equal(m.otros.find(o => o.key === "fleje-rollo").cantidad, c.rollos, "rollos GLOBAL, no la suma de los 4 muros");
  assert.equal(c.rollos, Math.ceil(fl.reduce((a, p) => a + p.largo, 0) / FLEJE.rollo));
  assert.ok(c.rollos < 4, "sumar los rollos redondeados de cada muro sobre-estimaría");
  assert.equal(c.t1, 12 * 2 * FLEJE.tornExtremo, "4 tornillos T1 por extremo");
});

// 8) Export Ruby: los flejes van en el tag Estructura-Flejes, orientados con su base real.
test("export Ruby: flejes en Estructura-Flejes, rotados por Transformation.axes", () => {
  const rb = exportRuby({ kind: "muro", ...pared(3000, 2600) });
  assert.match(rb, /t_fle=model\.layers\.add\("Estructura-Flejes"\)/, "declara la capa");
  const lineas = rb.split("\n").filter(l => l.includes("t_fle,"));
  assert.equal(lineas.length, 2, "2 flejes emitidos");
  lineas.forEach(l => {
    assert.match(l, /Geom::Transformation\.axes\(/, "se orienta con axes (pieza diagonal)");
    assert.match(l, /MAP_YZ, 3970/, "sección extruida el largo de la hipotenusa");
  });
  // las dos diagonales tienen direcciones opuestas en Z
  const dirZ = lineas.map(l => +l.match(/Vector3d\.new\(([-\d.]+),([-\d.]+),([-\d.]+)\)/).slice(1)[2]);
  assert.ok(dirZ[0] * dirZ[1] < 0, "una sube y la otra baja");
});

// Selector: sin arriostramiento no hay flejes (default del muro suelto).
test("arriostramiento 'ninguno' (default del muro) no agrega piezas", () => {
  assert.equal(flejesDe(muro.generar({ ...pared(3000, 2600), arriostramiento: "ninguno" }).piezas).length, 0);
  assert.equal(flejesDe(muro.generar({ sistema: "steel", largo: 3000, alto: 2600, vanos: [], opciones: OPC }).piezas).length, 0);
  assert.equal(muro.defaults().arriostramiento, "ninguno");
});

// Wood usa el mismo fleje metálico y la misma lógica.
test("wood frame: mismo fleje y misma geometría", () => {
  const w = buildBraces({ sistema: "wood", largo: 3000, alto: 2600, opciones: OPC, vanos: [], arriostramiento: "cruz" });
  assert.equal(w.piezas.length, 2);
  w.piezas.forEach(p => { assert.equal(p.largo, hip(3000, 2600)); assert.equal(p.orient.w, FLEJE.ancho); });
});
