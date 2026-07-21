// Invariantes de las piezas DIAGONALES (`orient`) en TODOS los módulos.
// Una pieza `orient` no trae `axis`: trae su base real { c, u(largo), v(ancho), n(espesor) }, y tanto
// el visor (Matrix4.makeBasis) como el export a SketchUp (Geom::Transformation.axes) la dibujan con
// esa base. Si la base no es ortonormal y DERECHA, la matriz tiene determinante negativo: la pieza
// sale ESPEJADA y con las caras invertidas — en el visor se ve el interior del perfil en vez de la
// cara de afuera, que es exactamente el "se ven huecos" que apareció en el techo.
import { test } from "vitest";
import assert from "node:assert/strict";
import { listModules, getModule } from "../src/engine/modules/index.mjs";

const OPC = { pgc: "PGC 100x0.90", pgu: "PGU 100x0.90" };
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];

// Un caso por módulo que EJERCITE piezas orient (arriostramiento y cabriadas).
const CASOS = {
  muro:      { largo: 4000, alto: 2600, arriostramiento: "cruz", vanos: [] },
  techo:     { tipo: "dosAguas", luz: 6000, largo: 4800, pendiente: 30, alero: 400,
               separacion: 600, sepCorreas: 1000, timpanos: true, cubierta: true },
  combinado: { largo: 4000, ancho: 3000, alto: 2600, arriostramiento: "cruz" }
};

for (const [id, extra] of Object.entries(CASOS)){
  test(`${id}: toda pieza orient tiene base ortonormal y derecha (u × v = n)`, () => {
    const P = getModule(id).generar({ kind: id, sistema: "steel", opciones: OPC, ...extra }).piezas;
    const orient = P.filter(p => p.orient);
    assert.ok(orient.length > 0, "el caso tiene que ejercitar piezas orient");
    orient.forEach(p => {
      const { u, v, n } = p.orient, e = 1e-9;
      [["u",u],["v",v],["n",n]].forEach(([k, a]) =>
        assert.ok(Math.abs(Math.hypot(...a) - 1) < e, `${p.tipo}: ${k} no es unitario`));
      assert.ok(Math.abs(dot(u,v)) < e && Math.abs(dot(u,n)) < e && Math.abs(dot(v,n)) < e,
        `${p.tipo}: la base no es ortogonal`);
      // determinante = +1 (base derecha). Con −1 la pieza se dibuja espejada y con caras invertidas.
      cross(u, v).forEach((c, i) => assert.ok(Math.abs(c - n[i]) < e,
        `${p.tipo}: base IZQUIERDA (u × v = −n) → se renderiza al revés`));
      assert.ok(p.orient.w > 0 && p.orient.t > 0, `${p.tipo}: sección sin espesor`);
      assert.ok(p.orient.c.every(Number.isFinite), `${p.tipo}: centro inválido`);
    });
  });
}

// El techo se apoya sobre el muro: z=0 tiene que ser el plano de apoyo, no dejar la cabriada enterrada.
test("techo: la estructura no queda por debajo del plano de apoyo (z=0)", () => {
  const { piezas } = getModule("techo").generar({ kind: "techo", sistema: "steel", opciones: OPC, ...CASOS.techo });
  const zMin = p => p.orient.c[2] - Math.abs(p.orient.v[2]) * p.orient.w/2
                                  - Math.abs(p.orient.u[2]) * p.largo/2;
  // Lo único que puede bajar del plano de apoyo:
  //   · el arriostre de cielo, atornillado BAJO el ala inferior (menos de 1 mm);
  //   · el ALERO del cordón superior, que por definición vuela hacia afuera y hacia abajo.
  const { alero, pendiente } = CASOS.techo, caidaAlero = alero * pendiente / 100;
  piezas.filter(p => p.orient).forEach(p => {
    const z = zMin(p);
    if (p.tipo === "FLEJE_CIELO") return assert.ok(z > -1, "el fleje de cielo roza el apoyo");
    if (p.tipo === "CORDON_SUPERIOR")
      return assert.ok(z >= -caidaAlero - 1, `el alero no puede bajar más que ${caidaAlero} mm (z=${z.toFixed(1)})`);
    assert.ok(z >= -1, `${p.tipo} enterrado bajo el plano de apoyo (z=${z.toFixed(1)})`);
  });
  const ci = piezas.find(p => p.tipo === "CORDON_INFERIOR");
  assert.ok(Math.abs(ci.orient.c[2] - 50) < 1e-6, "el cordón inferior (PGC 100) apoya su cara inferior en z=0");
});

// Ningún módulo puede quedarse sin este chequeo si mañana suma piezas orient.
test("los módulos con piezas orient están todos cubiertos", () => {
  const conOrient = listModules().map(m => m.id).filter(id => {
    try { return getModule(id).generar({ kind: id, sistema: "steel", opciones: OPC,
      ...(CASOS[id] || { largo: 4000, ancho: 3000, alto: 2600 }) }).piezas.some(p => p.orient); }
    catch { return false; }
  });
  conOrient.forEach(id => assert.ok(CASOS[id], `el módulo ${id} genera piezas orient y no está en CASOS`));
});
