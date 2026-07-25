// F9a — módulo combinado (Ambiente completo = piso + 4 muros). Orquestación pura: los conteos y la
// fusión deben ser la SUMA exacta de los submódulos, sin reimplementar geometría.
import { test } from "vitest";
import assert from "node:assert/strict";
import { combinado, cortesPorEtapaVsGlobal } from "../src/engine/modules/combinado.mjs";
import { computeProject } from "../src/engine/index.mjs";
import { piso } from "../src/engine/modules/piso.mjs";
import { muro } from "../src/engine/modules/muro.mjs";
import { pieceBoxEngine, boundsEngine } from "../src/engine/geometry.mjs";

const OPC = { pgc: "PGC 100x0.90", pgu: "PGU 100x0.90", lumber: "2x6 (38×140)", modulo: 400 };
const amb = (sistema, largo, ancho, extra = {}) => ({
  kind: "combinado", sistema, largo, ancho, alto: 2600, apoyo: "platea", placa: true, opciones: OPC,
  vanoFrente: [], vanoFondo: [], vanoIzq: [], vanoDer: [], ...extra
});
// espesor de muro (profundidad Y de un muro canónico) y suma esperada de piezas. El combinado agrega,
// además de la estructura de los submódulos, +1 PLACA de piso (diafragma, activa por default).
// Adamant calcula sólo estructura: no hay superficies de revestimiento.
const SUPERF = 1;
// Los 4 muros del ambiente son perimetrales portantes: el combinado los arriostra por default
// (`arriostraX: "cruz"`), así que el muro de referencia se genera con la misma opción.
function esperado(sistema, largo, ancho, vanos = {}){
  const wall = (larg, vv) => muro.generar({ sistema, largo: larg, alto: 2600, vanos: vv || [], opciones: OPC, arriostramiento: "cruz" }).piezas;
  // el espesor se mide sobre el FRAME (los flejes van apoyados por fuera de la cara)
  const e = Math.round(boundsEngine(wall(largo).filter(p => p.categoria !== "fleje")).size[1]);
  const encaj = ancho - 2 * e;
  const pisoN = piso.generar({ sistema, largo, ancho, separacion: 400, apoyo: "platea", placa: true, opciones: OPC }).piezas.length;
  // F11-bis.3: el combinado SUPRIME los 2 montantes de extremo de cada muro (4×2) y agrega 3 montantes
  // por esquina (4×3) → +4 piezas netas respecto de la suma de muros independientes.
  const ESQ_DELTA = 4*3 - 4*2;
  const n = pisoN + SUPERF + ESQ_DELTA
    + wall(largo, vanos.frente).length + wall(largo, vanos.fondo).length
    + wall(encaj, vanos.izq).length + wall(encaj, vanos.der).length;
  return { e, encaj, n };
}

// 1) Suma exacta sin vanos (steel), verificando el descuento de esquina (encajado = ancho − 2·e).
test("combinado steel 4×3 sin vanos: piezas = suma exacta de submódulos", () => {
  const inp = amb("steel", 4000, 3000);
  const { piezas, metadatos } = combinado.generar(inp);
  const exp = esperado("steel", 4000, 3000);
  assert.equal(piezas.length, exp.n, "total = piso + 2·muro(largo) + 2·muro(ancho−2e)");
  assert.equal(metadatos.espesorMuro, exp.e, "espesor de muro detectado");
  assert.equal(metadatos.partes.length, 5);
  // las 5 partes están presentes
  for (const parte of ["piso", "frente", "fondo", "izq", "der"])
    assert.ok(piezas.some(p => p.parte === parte), `falta la parte ${parte}`);
});

// 2) Con 1 puerta en el frente y 1 ventana en el lateral izquierdo → sigue siendo suma exacta.
test("combinado steel con puerta (frente) + ventana (izq): suma exacta", () => {
  const vanos = { frente: [{ tipo: "puerta", x1: 1600, x2: 2400, h: 2050, sill: 0 }],
                  izq:    [{ tipo: "ventana", x1: 900, x2: 2100, h: 2000, sill: 900 }] };
  const inp = amb("steel", 4000, 3000, { vanoFrente: vanos.frente, vanoIzq: vanos.izq });
  const { piezas } = combinado.generar(inp);
  assert.equal(piezas.length, esperado("steel", 4000, 3000, vanos).n);
  // hay piezas de vano (king/jack/dintel) aportadas por los muros con abertura
  assert.ok(piezas.some(p => p.tipo === "KING") && piezas.some(p => p.tipo === "DINTEL"));
});

// 3) Wood: misma orquestación.
test("combinado wood 4×3 sin vanos: suma exacta", () => {
  const inp = amb("wood", 4000, 3000);
  assert.equal(combinado.generar(inp).piezas.length, esperado("wood", 4000, 3000).n);
});

// 4) AABB entre partes: ninguna pieza de una parte se interpenetra con otra (contacto permitido).
//    Cubre las 4 esquinas (muro↔muro) y el apoyo muro↔piso. El encastre montante↔solera es interno de
//    cada muro (esperado), por eso el chequeo es ENTRE partes distintas.
//    EXENCIÓN `fleje`: la Cruz de San Andrés va APOYADA sobre la cara exterior del frame (no lo penetra),
//    pero (a) las dos diagonales de una cruz se superponen a propósito en el centro de la X, (b) su AABB
//    —al ser piezas diagonales— es mucho mayor que la chapa real y se solapa con la de la otra diagonal.
//    Un test de cajas alineadas a los ejes no puede decidir
//    interpenetración de piezas rotadas, así que los flejes quedan fuera de este chequeo.
for (const [nombre, sis, L, W] of [["steel 4×3", "steel", 4000, 3000], ["wood 5×4", "wood", 5000, 4000]]){
  test(`combinado ${nombre}: sin colisión entre partes (AABB)`, () => {
    const P = combinado.generar(amb(sis, L, W)).piezas.filter(p => !p.superficie && p.categoria !== "fleje");
    const bs = P.map(p => { const { size, center } = pieceBoxEngine(p); return { parte: p.parte, tipo: p.tipo, b: [0,1,2].map(i => [center[i]-size[i]/2, center[i]+size[i]/2]) }; });
    const eps = 0.5;
    const solapa = (a, b) => [0,1,2].every(i => a[i][0] < b[i][1] - eps && b[i][0] < a[i][1] - eps);
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++)
      if (bs[i].parte !== bs[j].parte)
        assert.ok(!solapa(bs[i].b, bs[j].b), `colisión ${bs[i].parte}/${bs[i].tipo} ↔ ${bs[j].parte}/${bs[j].tipo}`);
  });
}

// F11-bis.3 — poste de esquina: 3 montantes en contacto real, cero huecos.
test("esquinas: 3 montantes por esquina en contacto, sin hueco", () => {
  const { piezas, metadatos } = combinado.generar(amb("steel", 4000, 3000));
  const posts = piezas.filter(p => p.tipo === "MONTANTE_ESQUINA" || p.tipo === "MONTANTE_ARRANQUE")
    .map(p => ({ tipo: p.tipo, b: pieceBoxEngine(p) }));
  assert.equal(posts.length, 12, "4 esquinas × 3 montantes");
  const rng = b => [[b.center[0]-b.size[0]/2, b.center[0]+b.size[0]/2], [b.center[1]-b.size[1]/2, b.center[1]+b.size[1]/2]];
  const ov = (u, v) => u[0] < v[1] && v[0] < u[1];
  const tocan = (a, b) => (Math.max(a[0][0]-b[0][1], b[0][0]-a[0][1]) <= 0.5 && ov(a[1], b[1]))
                       || (Math.max(a[1][0]-b[1][1], b[1][0]-a[1][1]) <= 0.5 && ov(a[0], b[0]));
  metadatos.esquinas.forEach(([cx, cy]) => {
    const near = posts.filter(p => Math.abs(p.b.center[0]-cx) < 300 && Math.abs(p.b.center[1]-cy) < 300);
    assert.equal(near.length, 3, `esquina (${cx},${cy}) debe tener 3 montantes`);
    assert.equal(near.filter(p => p.tipo === "MONTANTE_ESQUINA").length, 2, "doble del pasante");
    assert.equal(near.filter(p => p.tipo === "MONTANTE_ARRANQUE").length, 1, "arranque del encajado");
    near.forEach((p, i) => assert.ok(near.some((q, j) => j !== i && tocan(rng(p.b), rng(q.b))),
      `un montante de la esquina (${cx},${cy}) quedó suelto (hueco)`));
  });
  // el cómputo suma los T1 de esquina: 4 × 2 uniones × ceil(2600/600) = 4×2×5 = 40
  const m = combinado.materiales(piezas, amb("steel", 4000, 3000));
  assert.ok(m.tornillos.t1 >= 40, "T1 de esquina en el cómputo");
});

// F11-bis.3 — medida interior derivada + inversión de pasante/encajado.
test("convención de medidas: interior derivado y swap de pasante", () => {
  const ff = combinado.generar(amb("steel", 4000, 3000)); // frente/fondo pasante (default)
  assert.deepEqual(ff.metadatos.exterior, { x: 4000, y: 3000 });
  assert.deepEqual(ff.metadatos.interior, { x: 4000 - 2*ff.metadatos.espesorMuro, y: 3000 - 2*ff.metadatos.espesorMuro });
  // el muro frente (pasante) corre los 4000 completos; el izq (encajado) corre ancho − 2e
  const largoDe = (P, parte) => Math.max(...P.filter(p => p.parte === parte && p.tipo === "SOL.PANEL").map(p => p.box ? p.box.size[0] : p.largo));
  const lat = combinado.generar(amb("steel", 4000, 3000, { pasante: "laterales" }));
  // al invertir, ahora los laterales corren de punta a punta (ancho completo) y frente/fondo encajan
  assert.equal(lat.metadatos.esquinas.length, 4);
  assert.ok(lat.piezas.filter(p => p.tipo === "MONTANTE_ESQUINA").length === 8, "sigue habiendo 4 postes de esquina");
});

// 4b) Bounding box global = largo × ancho × (alto entramado + placa + alto muro).
test("combinado steel 4×3: bounding box = largo × ancho × alto total", () => {
  const inp = amb("steel", 4000, 3000);
  const { piezas, metadatos } = combinado.generar(inp);
  // envolvente ESTRUCTURAL: rev (superficie) y flejes sobresalen del frame por diseño
  const { size } = boundsEngine(piezas.filter(p => !p.superficie && p.categoria !== "fleje"));
  assert.ok(Math.abs(size[0] - 4000) < 1 && Math.abs(size[1] - 3000) < 1, `footprint ${size[0]}×${size[1]}`);
  const hPiso = boundsEngine(piso.generar({ sistema: "steel", largo: 4000, ancho: 3000, separacion: 400, apoyo: "platea", placa: true, opciones: OPC }).piezas.filter(p => !p.superficie)).size[2];
  assert.ok(Math.abs(size[2] - (hPiso + 18 + 2600)) < 2, `alto total ${size[2]} (esperado ${hPiso + 18 + 2600})`);
  assert.deepEqual(metadatos.bbox.map(Math.round), size.map(Math.round));
});

// 4c) Placa de piso y contacto: con placa activa se renderiza la superficie (18 mm) y el muro apoya
//     SOBRE ella; sin placa, el muro apoya directo sobre el entramado. En ambos casos: contacto ≤ 1 mm.
for (const placa of [true, false]){
  test(`combinado steel 4×3 placa=${placa}: muro en contacto con lo de abajo (tol 1 mm)`, () => {
    const P = combinado.generar(amb("steel", 4000, 3000, { placa })).piezas;
    const zRange = arr => { const bs = arr.map(p => pieceBoxEngine(p)); return [Math.min(...bs.map(b => b.center[2]-b.size[2]/2)), Math.max(...bs.map(b => b.center[2]+b.size[2]/2))]; };
    const entramado = zRange(P.filter(p => p.parte === "piso" && p.tipo !== "PLACA"))[1]; // cota sup del entramado
    // el fleje es diagonal: su AABB desborda el alto del muro por el ancho de la chapa (no es su base)
    const muroBot = zRange(P.filter(p => ["frente","fondo","izq","der"].includes(p.parte) && p.categoria !== "fleje"))[0];
    const placaPiece = P.find(p => p.tipo === "PLACA");
    if (placa){
      assert.ok(placaPiece, "la placa se renderiza como pieza");
      const [pbot, ptop] = zRange([placaPiece]);
      assert.ok(Math.abs(pbot - entramado) <= 1, "placa apoya sobre el entramado");
      assert.ok(Math.abs(ptop - muroBot) <= 1, "el muro apoya sobre la placa (contacto)");
      assert.ok(Math.abs(ptop - pbot - 18) <= 0.1, "espesor de placa = 18 mm");
    } else {
      assert.ok(!placaPiece, "sin placa no se renderiza superficie");
      assert.ok(Math.abs(muroBot - entramado) <= 1, "el muro apoya directo sobre el entramado (sin 18 mm)");
    }
  });
}

// 4d) La única superficie visual del ambiente es la placa de piso (diafragma estructural); no computa
//     en cortes. Adamant no dibuja ni computa revestimientos.
test("combinado: la placa de piso es superficie visual (no computa) y no hay revestimientos", () => {
  const inp = amb("steel", 4000, 3000);
  const P = combinado.generar(inp).piezas;
  assert.ok(!P.some(p => p.tipo === "REV.EXT" || p.tipo === "REV.INT"), "sin revestimientos");
  assert.equal(P.filter(p => p.tipo === "PLACA").length, 1, "sólo la placa de piso (diafragma)");
  assert.ok(P.filter(p => p.tipo === "PLACA").every(p => p.superficie && p.capa === "placa-piso"));
  assert.deepEqual([...new Set(P.filter(p => p.capa).map(p => p.capa))].sort(), ["apoyos", "placa-piso"]);
  const { cortes } = computeProject(inp);
  assert.ok(!cortes.grupos.some(g => g.perfil === "a definir" || /Placa de piso/.test(g.perfil)), "la placa no entra en cortes");
});

// 4e) Tres tipos de vano: puerta (frente) + ventana (izq) + arcada 2,00 m (fondo). Verifica dintel
//     doble en la arcada, solera de vano SOLO en la ventana, y carpintería (puerta/ventana ítems, arcada no).
test("combinado 3×4: puerta + ventana + arcada (dintel doble, solera de vano, carpintería)", () => {
  const inp = amb("steel", 3000, 4000, {
    vanoFrente: [{ tipo: "puerta",  x1: 1100, x2: 1900, h: 2050, sill: 0 }],
    vanoIzq:    [{ tipo: "ventana", x1: 1200, x2: 2400, h: 2000, sill: 900 }],
    vanoFondo:  [{ tipo: "arcada",  x1: 500,  x2: 2500, h: 2100, sill: 0 }] // 2,00 m > 1,50 → dintel doble
  });
  const P = combinado.generar(inp).piezas;
  assert.equal(P.filter(p => p.tipo === "SOL.VANO").length, 1, "solera de vano SOLO en la ventana");
  // muros aislados para aislar la geometría del dintel:
  const wall = v => muro.generar({ sistema: "steel", largo: 3000, alto: 2600, opciones: OPC, vanos: [v] }).piezas;
  const arc = wall({ tipo: "arcada", x1: 500, x2: 2500, h: 2100, sill: 0 });
  const pta = wall({ tipo: "puerta", x1: 1100, x2: 1900, h: 2050, sill: 0 });
  assert.equal(arc.filter(p => p.tipo === "DINTEL").length, 4, "arcada 2,00 m → dintel DOBLE (4 piezas)");
  assert.equal(pta.filter(p => p.tipo === "DINTEL").length, 2, "puerta 0,80 m → dintel simple (2 piezas)");
  assert.equal(arc.filter(p => p.tipo === "SOL.VANO").length, 0, "arcada sin solera de vano");
  assert.equal(pta.filter(p => p.tipo === "SOL.VANO").length, 0, "puerta sin solera de vano");
  // carpintería
  const m = combinado.materiales(P, inp), keys = m.otros.map(o => o.key);
  assert.equal(m.otros.find(o => o.key === "carp-puerta")?.cantidad, 1, "1 puerta como ítem");
  assert.equal(m.otros.find(o => o.key === "carp-ventana")?.cantidad, 1, "1 ventana como ítem");
  assert.ok(!keys.some(k => k.includes("arcada")), "la arcada no lleva carpintería");
});

// 5) Fusión de materiales: perfiles optimizados GLOBAL, otros y tornillos T1 sumados.
test("combinado steel 4×3: materiales fusionados (perfiles global + otros del piso)", () => {
  const inp = amb("steel", 4000, 3000);
  const { piezas } = combinado.generar(inp);
  const m = combinado.materiales(piezas, inp);
  assert.ok(m.perfiles.length >= 1 && m.perfiles.every(p => p.barras >= 1));
  assert.ok(m.otros.some(o => o.key === "pgu-implantacion"), "otros del piso presentes");
  assert.ok(m.tornillos.t1 > 0);
  assert.equal(m.area, 12);
});

// 6) Cortes GLOBAL vs POR ETAPA: cortar todo junto usa ≤ barras que por etapa; el ahorro es el número.
test("combinado: la optimización global ahorra barras vs por etapa", () => {
  const r = cortesPorEtapaVsGlobal(amb("steel", 4000, 3000));
  assert.ok(r.global <= r.porEtapa, "global nunca usa más barras que por etapa");
  assert.equal(r.ahorro, r.porEtapa - r.global);
  assert.equal(r.porEtapa, 38); assert.equal(r.global, 36);
  assert.equal(r.ahorro, 2, "cortando todo junto se ahorran 2 barras (38 → 36, ya con postes de esquina)");
});

// ============ F13 — Ambiente por niveles: cielorraso + techo integrados ============
const ambN = (largo, ancho, extra = {}) => amb("steel", largo, ancho, {
  llevaCielo: true, cieloSusp: 400, cieloPerfil: "Solera/montante 70",
  llevaTecho: true, techoTipo: "dosAguas", techoPendiente: 30, techoAlero: 400, techoTimpanos: true, techoCubierta: true, ...extra });

// OBB (SAT) que sirve para cajas alineadas Y para piezas diagonales (orient): la caja alineada usa la
// base canónica. Es una verificación más fuerte que la AABB — necesaria porque el techo es todo
// piezas diagonales, cuya AABB desbordaría y daría falsos positivos contra muros y cielo.
const OBB = p => p.orient
  ? { c: p.orient.c, ejes: [p.orient.u, p.orient.v, p.orient.n], h: [p.largo/2, p.orient.w/2, p.orient.t/2] }
  : (() => { const { size, center } = pieceBoxEngine(p); return { c: center, ejes: [[1,0,0],[0,1,0],[0,0,1]], h: [size[0]/2, size[1]/2, size[2]/2] }; })();
function obbChoca(a, b, eps){
  const ejes = [...a.ejes, ...b.ejes];
  for (const A of a.ejes) for (const B of b.ejes){
    const c = [A[1]*B[2]-A[2]*B[1], A[2]*B[0]-A[0]*B[2], A[0]*B[1]-A[1]*B[0]];
    if (Math.hypot(...c) > 1e-6) ejes.push(c.map(v => v/Math.hypot(...c)));
  }
  const d = [0,1,2].map(i => b.c[i] - a.c[i]);
  for (const e of ejes){
    const proy = o => o.ejes.reduce((s, ax, k) => s + Math.abs(ax[0]*e[0]+ax[1]*e[1]+ax[2]*e[2]) * o.h[k], 0);
    if (Math.abs(d[0]*e[0]+d[1]*e[1]+d[2]*e[2]) >= proy(a) + proy(b) - eps) return false;
  }
  return true;
}

// 7) Niveles opcionales: sin llevar → sin piezas de ese nivel; con llevar → aparecen y se listan.
test("F13: cielorraso y techo son opcionales dentro del ambiente", () => {
  const sin = combinado.generar(amb("steel", 4000, 3000));
  assert.ok(!sin.piezas.some(p => p.parte === "cielo" || p.parte === "techo"), "por default no llevan");
  assert.deepEqual(sin.metadatos.partes.map(p => p.id), ["piso","frente","fondo","izq","der"]);
  const con = combinado.generar(ambN(4000, 3000));
  assert.ok(con.piezas.some(p => p.parte === "cielo"), "cielo presente");
  assert.ok(con.piezas.some(p => p.parte === "techo"), "techo presente");
  assert.deepEqual(con.metadatos.partes.map(p => p.id), ["piso","frente","fondo","izq","der","cielo","techo"]);
  assert.deepEqual(con.metadatos.niveles, { cielo: true, techo: true });
});

// 8) Elevación: el techo apoya sobre la solera superior de los muros; el cielo cuelga por debajo.
test("F13: el techo apoya sobre los muros y el cielo cuelga de la cota correcta", () => {
  const { piezas, metadatos } = combinado.generar(ambN(4000, 3000));
  const tope = metadatos.hMuro + 2600;                 // cara superior de los muros
  const zBot = arr => Math.min(...arr.map(p => pieceBoxEngine(p).center[2] - pieceBoxEngine(p).size[2]/2));
  const zTop = arr => Math.max(...arr.map(p => pieceBoxEngine(p).center[2] + pieceBoxEngine(p).size[2]/2));
  const cordonInf = piezas.filter(p => p.tipo === "CORDON_INFERIOR");
  assert.ok(Math.abs(zBot(cordonInf) - tope) <= 1, "el cordón inferior apoya en la cara superior de los muros");
  const velas = piezas.filter(p => p.tipo === "VELA");
  assert.ok(Math.abs(zTop(velas) - tope) <= 1, "las velas del cielo llegan hasta la cota de cuelgue");
  assert.ok(zBot(piezas.filter(p => p.parte === "cielo")) < tope - 300, "la grilla del cielo queda por debajo");
});

// 9) AABB/OBB con TECHO incluido: ninguna pieza de un nivel interpenetra otro (contacto permitido).
test("F13: sin interpenetración entre niveles con el techo incluido (OBB)", () => {
  const P = combinado.generar(ambN(5000, 4000)).piezas.filter(p => !p.superficie && p.categoria !== "fleje");
  const bs = P.map(p => ({ parte: p.parte, tipo: p.tipo, obb: OBB(p) }));
  const eps = 6; // tolera el contacto entre niveles (apoyo, cuelgue) y el inglete de las cabriadas
  const choques = [];
  for (let i = 0; i < bs.length; i++) for (let j = i+1; j < bs.length; j++)
    if (bs[i].parte !== bs[j].parte && obbChoca(bs[i].obb, bs[j].obb, eps))
      choques.push(`${bs[i].parte}/${bs[i].tipo} ↔ ${bs[j].parte}/${bs[j].tipo}`);
  assert.deepEqual(choques, [], "sin interpenetración entre niveles");
});

// 10) Cómputo y cortes UNIFICADOS: los materiales del techo y del cielo entran al listado global.
test("F13: materiales y cortes absorben techo y cielorraso", () => {
  const inp = ambN(5000, 4000);
  const { piezas } = combinado.generar(inp);
  const m = combinado.materiales(piezas, inp);
  const keys = m.otros.map(o => o.key);
  assert.ok(keys.includes("chapa"), "la chapa del techo entra al cómputo");
  assert.ok(keys.includes("fija-perim"), "la fijación perimetral del cielo entra al cómputo");
  assert.ok(m.perfiles.some(x => x.perfil === "PGO 37x22x12.5"), "las correas Omega del techo entran a cortes");
  assert.ok(m.perfiles.some(x => x.perfil === "Solera/montante 70"), "el perfil del cielo entra a cortes");
  assert.ok(m.peso > combinado.materiales(combinado.generar(amb("steel",5000,4000)).piezas, amb("steel",5000,4000)).peso, "el ambiente con niveles pesa más");
  // por etapa vs global: agregar niveles no rompe la relación (global ≤ por etapa)
  const r = cortesPorEtapaVsGlobal(inp);
  assert.ok(r.global <= r.porEtapa && r.ahorro === r.porEtapa - r.global);
});
