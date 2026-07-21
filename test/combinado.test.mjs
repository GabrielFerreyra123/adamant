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
// además de la estructura de los submódulos: +1 PLACA de piso (placa activa por default) y +8 superficies
// de revestimiento (exterior + interior por cada uno de los 4 muros).
const SUPERF = 1 + 8;
// Los 4 muros del ambiente son perimetrales portantes: el combinado los arriostra por default
// (`arriostraX: "cruz"`), así que el muro de referencia se genera con la misma opción.
function esperado(sistema, largo, ancho, vanos = {}){
  const wall = (larg, vv) => muro.generar({ sistema, largo: larg, alto: 2600, vanos: vv || [], opciones: OPC, arriostramiento: "cruz" }).piezas;
  // el espesor se mide sobre el FRAME (los flejes van apoyados por fuera de la cara)
  const e = Math.round(boundsEngine(wall(largo).filter(p => p.categoria !== "fleje")).size[1]);
  const encaj = ancho - 2 * e;
  const pisoN = piso.generar({ sistema, largo, ancho, separacion: 400, apoyo: "platea", placa: true, opciones: OPC }).piezas.length;
  const n = pisoN + SUPERF
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
//    —al ser piezas diagonales— es mucho mayor que la chapa real y se solapa con la de la otra diagonal y
//    con la capa visual de revestimiento exterior. Un test de cajas alineadas a los ejes no puede decidir
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

// 4b) Bounding box global = largo × ancho × (alto entramado + placa + alto muro).
test("combinado steel 4×3: bounding box = largo × ancho × alto total", () => {
  const inp = amb("steel", 4000, 3000);
  const { piezas, metadatos } = combinado.generar(inp);
  // envolvente ESTRUCTURAL: rev (superficie) y flejes sobresalen del frame por diseño
  const { size } = boundsEngine(piezas.filter(p => !p.superficie && p.categoria !== "fleje"));
  assert.ok(Math.abs(size[0] - 4000) < 1 && Math.abs(size[1] - 3000) < 1, `footprint ${size[0]}×${size[1]}`);
  const hPiso = boundsEngine(piso.generar({ sistema: "steel", largo: 4000, ancho: 3000, separacion: 400, apoyo: "platea", placa: true, opciones: OPC }).piezas).size[2];
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

// 4d) Capas de revestimiento: superficies genéricas (8: ext+int por muro) + placa de piso, todas con
//     `capa` y `superficie`, que NO entran en cortes/materiales.
test("combinado: capas de revestimiento son superficies visuales (no computan)", () => {
  const inp = amb("steel", 4000, 3000);
  const P = combinado.generar(inp).piezas;
  assert.equal(P.filter(p => p.tipo === "REV.EXT").length, 4, "1 rev exterior por muro");
  assert.equal(P.filter(p => p.tipo === "REV.INT").length, 4, "1 rev interior por muro");
  assert.equal(P.filter(p => p.tipo === "PLACA").length, 1);
  assert.ok(P.filter(p => ["REV.EXT","REV.INT","PLACA"].includes(p.tipo)).every(p => p.superficie && p.capa), "todas con capa + superficie");
  // capas presentes
  assert.deepEqual([...new Set(P.filter(p => p.capa).map(p => p.capa))].sort(), ["placa-piso", "rev-ext", "rev-int"]);
  // no afectan cortes: la lista de corte no incluye el perfil "a definir" ni "OSB…"
  const { cortes } = computeProject(inp);
  assert.ok(!cortes.grupos.some(g => g.perfil === "a definir" || g.perfil === "OSB/fenólico 18 mm"));
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

// 5) Fusión de materiales: perfiles optimizados GLOBAL, placas/otros/tornillos sumados.
test("combinado steel 4×3: materiales fusionados (perfiles global + otros del piso)", () => {
  const inp = amb("steel", 4000, 3000);
  const { piezas } = combinado.generar(inp);
  const m = combinado.materiales(piezas, inp);
  assert.ok(m.perfiles.length >= 1 && m.perfiles.every(p => p.barras >= 1));
  assert.ok(m.otros.some(o => o.key === "pgu-implantacion"), "otros del piso presentes");
  assert.ok(m.tornillos.t1 > 0);
  assert.equal(m.area, 12);
});

// 5b) Paridad export↔visor: el transform `p.xf` (que emite el Ruby) reproduce EXACTAMENTE la caja
//     `p.box` que dibuja el visor. Si esto coincide, el script pegado en SketchUp arma lo mismo que el 3D.
test("combinado: el xf del export reproduce la caja del visor", () => {
  const P = combinado.generar(amb("steel", 4000, 3000)).piezas;
  // Los flejes quedan fuera: su transform NO viaja en `xf` sino BAKEADO en su base `orient` (el
  // orquestador rota la base al reubicarlos), y el export los emite desde ahí.
  P.filter(p => p.xf && p.categoria !== "fleje").forEach(p => { // la PLACA se emite directo desde su box (sin xf)
    const can = pieceBoxEngine({ ...p, box: undefined }); // caja canónica (local, sin reubicar)
    const t = p.xf, [sx, sy, sz] = can.size, [cx, cy, cz] = can.center;
    const box = t.rot === 90
      ? { size: [sy, sx, sz], center: [-cy + t.tx, cx + t.ty, cz + t.tz] }
      : { size: [sx, sy, sz], center: [cx + t.tx, cy + t.ty, cz + t.tz] };
    assert.deepEqual(box.size.map(Math.round), p.box.size.map(Math.round), `${p.parte}/${p.tipo} size`);
    assert.deepEqual(box.center.map(Math.round), p.box.center.map(Math.round), `${p.parte}/${p.tipo} center`);
  });
});

// 6) Cortes GLOBAL vs POR ETAPA: cortar todo junto usa ≤ barras que por etapa; el ahorro es el número.
test("combinado: la optimización global ahorra barras vs por etapa", () => {
  const r = cortesPorEtapaVsGlobal(amb("steel", 4000, 3000));
  assert.ok(r.global <= r.porEtapa, "global nunca usa más barras que por etapa");
  assert.equal(r.ahorro, r.porEtapa - r.global);
  assert.equal(r.porEtapa, 36); assert.equal(r.global, 34);
  assert.equal(r.ahorro, 2, "cortando todo junto se ahorran 2 barras (36 → 34)");
});
