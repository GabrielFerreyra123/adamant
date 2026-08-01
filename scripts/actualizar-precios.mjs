// ADAMANT · mantenimiento de los precios de referencia (src/config/precios-referencia.js).
//
//   node scripts/actualizar-precios.mjs            → CHEQUEO: que la tabla cubra todos los materiales.
//   node scripts/actualizar-precios.mjs --ipc 8    → sube todos los precios 8% y pone la fecha de hoy.
//
// La tabla es curada (vos ponés los números reales de tu corralón). Este script no scrapea: sólo
// verifica cobertura y aplica un ajuste por inflación para no tocar 20 números a mano.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { computeProject } from "../src/engine/index.mjs";
import { precioRef, PRECIOS_REF } from "../src/config/precios-referencia.js";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = resolve(RAIZ, "src/config/precios-referencia.js");
const OPC = { pgc: "PGC 100x0.90", pgu: "PGU 100x0.90", lumber: "2x6 (38×140)", modulo: 400 };
const V = (x1, x2, h, sill = 0) => ({ tipo: "ventana", x1, x2, h, sill });

// Inputs representativos para juntar TODAS las claves de material que el motor puede emitir.
const CASOS = [
  { kind: "muro", sistema: "steel", largo: 4000, alto: 2600, vanos: [V(1000, 2000, 2000, 0)], opciones: OPC },
  { kind: "piso", sistema: "steel", largo: 5000, ancho: 4000, apoyo: "pilotines", placa: true, opciones: OPC, vano: { x: 1000, y: 1000, ancho: 1000, largo: 1000 } },
  { kind: "cielo", sistema: "steel", largo: 4000, ancho: 3000, suspension: 400, opciones: { perfil: "Solera/montante 70" } },
  { kind: "techo", sistema: "steel", tipo: "dosAguas", luz: 4000, largo: 6000, pendiente: 25, alero: 400, cubierta: true, opciones: OPC },
  { kind: "combinado", sistema: "steel", largo: 6000, ancho: 4000, alto: 2600, apoyo: "platea", placa: true,
    vanoFrente: [{ tipo: "puerta", x1: 2500, x2: 3400, h: 2050, sill: 0 }], vanoIzq: [V(1000, 2200, 2000, 900)],
    llevaCielo: true, cieloSusp: 400, cieloPerfil: "Solera/montante 70", llevaTecho: true, techoTipo: "dosAguas", techoCubierta: true, opciones: OPC },
  { kind: "combinado", sistema: "wood", largo: 5000, ancho: 4000, alto: 2600, apoyo: "platea", placa: true, opciones: OPC }
];

function clavesDeCaso(input){
  const { materiales } = computeProject(input);
  const ks = new Set();
  (materiales.perfiles || []).forEach(p => ks.add(`perf:${p.perfil}`));
  if (materiales.tornillos?.t1) ks.add("t1");
  (materiales.otros || []).forEach(o => ks.add(o.key));
  return ks;
}

const args = process.argv.slice(2);
const ipcIdx = args.indexOf("--ipc");

if (ipcIdx === -1){
  // --- chequeo de cobertura ---
  const todas = new Set();
  for (const c of CASOS) for (const k of clavesDeCaso(c)) todas.add(k);
  const faltan = [...todas].filter(k => !(precioRef(k) > 0)).sort();
  console.log(`Claves de material detectadas: ${todas.size}`);
  if (faltan.length){
    console.error(`\n✗ SIN precio de referencia (${faltan.length}):`);
    faltan.forEach(k => console.error("   " + k));
    console.error("\nAgregá esas claves a `fijos` en src/config/precios-referencia.js");
    process.exit(1);
  }
  console.log("✓ Todos los materiales tienen precio de referencia.");
  console.log(`Vigente desde: ${PRECIOS_REF.vigenteDesde} · $/kg acero: ${PRECIOS_REF.aceroKgGalv} · $/m³ madera: ${PRECIOS_REF.maderaM3}`);
  console.log("\nPara ajustar por inflación:  node scripts/actualizar-precios.mjs --ipc <porcentaje>");
} else {
  // --- bump por inflación (reescribe los números del objeto PRECIOS_REF y la fecha) ---
  const pct = Number(args[ipcIdx + 1]);
  if (!isFinite(pct)){ console.error("Uso: --ipc <porcentaje>  (ej. --ipc 8)"); process.exit(1); }
  const factor = 1 + pct / 100;
  const src = readFileSync(FILE, "utf8").split("\n");
  const ini = src.findIndex(l => l.includes("export const PRECIOS_REF"));
  const fin = src.findIndex((l, i) => i > ini && l.trim() === "};");
  if (ini < 0 || fin < 0){ console.error("No encontré el objeto PRECIOS_REF"); process.exit(1); }
  const hoy = new Date().toISOString().slice(0, 10);
  let n = 0;
  for (let i = ini; i <= fin; i++){
    if (/vigenteDesde:/.test(src[i])){ src[i] = src[i].replace(/"\d{4}-\d{2}-\d{2}"/, `"${hoy}"`); continue; }
    // sube el número de las líneas `clave: <entero>` (rates y fijos), preservando coma y comentario
    src[i] = src[i].replace(/(:\s*)(\d+)(\s*,?)/, (m, a, num, c) => { n++; return a + Math.round(+num * factor) + c; });
  }
  writeFileSync(FILE, src.join("\n"));
  console.log(`✓ ${n} precios actualizados ×${factor.toFixed(2)} · vigenteDesde = ${hoy}`);
  console.log("Revisá el diff y commiteá.");
}
