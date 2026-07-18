// F2 — anti-regresión del mapeo de ejes del visor (sin WebGL, sobre la geometría pura).
import { test } from "vitest";
import assert from "node:assert/strict";
import { buildPieces } from "../src/engine/index.mjs";
import { piso } from "../src/engine/modules/piso.mjs";
import { boundsThree, pieceBoxEngine } from "../src/viewer/geometry.js";

const doorWall = { sistema:"steel", largo:3000, alto:2600, vanos:[{ x1:1050, x2:1950, h:2050, sill:0 }], opciones:{ modulo:400 } };

test("bounding box del muro parado: ancho X ~3000, alto Y ~2600, prof Z 90-140", () => {
  const { size } = boundsThree(buildPieces(doorWall)); // [X, Y(alto), Z(prof)]
  assert.ok(size[0] > 2990 && size[0] < 3010, `ancho X = ${size[0]} (esperado ~3000)`);
  assert.ok(size[1] > 2560 && size[1] < 2610, `alto Y = ${size[1]} (esperado ~2600)`);
  assert.ok(size[2] >= 90 && size[2] <= 140, `prof Z = ${size[2]} (esperado 90-140)`);
  // guardas explícitas contra el mapeo invertido
  assert.ok(!(size[2] > 2000), "profundidad ~2600 → ejes invertidos");
  assert.ok(!(size[1] < 200), "alto ~100 → ejes invertidos");
});

test("montantes son verticales: largo en Z del motor (no en X)", () => {
  const mont = buildPieces(doorWall).find(p => p.tipo === "MONTANTE");
  const { size } = pieceBoxEngine(mont);       // [x, y, z] motor
  assert.ok(size[2] > 2000, `alto del montante en Z = ${size[2]}`); // el largo va en Z (altura)
  assert.ok(size[0] < 100 && size[1] < 200, "sección chica en X/Y");
});

// F7b — el piso renderiza ACOSTADO: el alto (Y de Three) es ~el alma de la viga, no metros.
test("piso: bounding box acostado (alto Y ≈ alma, no metros)", () => {
  const inp = { sistema:"steel", largo:4000, ancho:3000, separacion:400, apoyo:"platea", placa:true, opciones:{ pgc:"PGC 150x1.60", pgu:"PGU 150x1.60" } };
  const { size } = boundsThree(piso.generar(inp).piezas); // [X=corrida, Y(alto)=alma, Z=luz]
  assert.ok(size[0] > 3900 && size[0] < 4200, `X(corrida) = ${size[0]} (~4000)`);
  assert.ok(size[1] < 300, `alto Y = ${size[1]} debe ser ~alma de viga (PGC 150 → 150), no metros`);
  assert.ok(size[2] > 2900 && size[2] < 3200, `Z(luz) = ${size[2]} (~3000)`);
});

test("soleras son horizontales: largo en X del motor", () => {
  const sol = buildPieces(doorWall).find(p => p.tipo === "SOL.PANEL" && p.largo > 2000);
  const { size } = pieceBoxEngine(sol);
  assert.ok(size[0] > 2000, `largo de la solera en X = ${size[0]}`);
  assert.ok(size[2] < 100, "espesor chico en Z (altura)");
});
