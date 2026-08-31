// ADAMANT · puerta de verificación del ENTREGABLE (método Noxis, sección 5-6-9).
// Los dos gates que ya había (`npm test`, `npm run build`) miran el código; ninguno mira el papel que
// va a la obra. Este comando genera el PDF de obra de unos proyectos representativos, RASTERIZA los
// números que importan para que una persona los LEA (no "lo miré y está bien"), y FALLA en rojo si:
//   · una pieza cortable desaparece entre la geometría y el plan de corte (regla 5: nada se descarta);
//   · el PDF no dice lo que la pantalla dice (regla 2: `over` → empalme) — o lo dice de más;
//   · el PDF estima un número en silencio (regla 3: merma de sierra y precios de referencia).
// Un gate que no puede correr tiene que fallar, no saltearse: cualquier excepción => exit 1.
import { mkdirSync, writeFileSync } from "node:fs";
import { computeProject, cutPlan, cutOpts } from "../src/engine/index.mjs";
import { exportPDF } from "../src/export/pdf.mjs";
import { exportDossier } from "../src/export/dossier.mjs";

const OPC = { pgc: "PGC 100x0.90", pgu: "PGU 100x0.90", lumber: "2x6 (38×140)", modulo: 400 };
const PROYECTOS = [
  { nom: "Muro 3 m (sin empalmes)", esperaOver: false,
    input: { kind: "muro", sistema: "steel", tipoMuro: "exterior", largo: 3000, alto: 2600, vanos: [], opciones: OPC } },
  { nom: "Muro 8 m (soleras > barra)", esperaOver: true,
    input: { kind: "muro", sistema: "steel", tipoMuro: "exterior", largo: 8000, alto: 2600, vanos: [], opciones: OPC } },
  { nom: "Ambiente 5×4 con techo", esperaOver: null,
    input: { kind: "combinado", sistema: "steel", largo: 5000, ancho: 4000, alto: 2600, apoyo: "platea", placa: true,
      opciones: OPC, vanoFrente: [], vanoFondo: [], vanoIzq: [], vanoDer: [], llevaTecho: true, techoTipo: "dosAguas", techoPendiente: 30 } }
];

const OUT = ".entregable";
mkdirSync(OUT, { recursive: true });
const fail = [];
const check = (cond, msg) => { if (!cond) fail.push(msg); return cond; };
const num = n => String(n).padStart(6);

console.log("\nADAMANT · verificación del entregable (PDF de obra)\n" + "─".repeat(58));

for (const { nom, input, esperaOver } of PROYECTOS){
  const { piezas } = computeProject(input);
  const plan = cutPlan(piezas, cutOpts(input));
  const noFleje = plan.filter(pl => !pl.fleje);

  // Invariante regla 5: cada pieza cortable está en una barra O contada como `over`; ninguna se descarta.
  const cortables = piezas.filter(p => !p.superficie && p.categoria !== "fleje").length;
  const enBarras = noFleje.reduce((a, pl) => a + pl.bins.reduce((s, b) => s + b.items.length, 0), 0);
  const over = noFleje.reduce((a, pl) => a + (pl.over || 0), 0);
  check(cortables === enBarras + over,
    `${nom}: piezas cortables (${cortables}) ≠ en barras (${enBarras}) + empalme (${over}) — una pieza se perdió`);

  // El PDF: leer el texto real del binario (mismo criterio que test/pdf.test.mjs).
  const { doc, nombre } = await exportPDF(input, { out: "buffer" });
  const buf = Buffer.from(doc.output("arraybuffer"));
  writeFileSync(`${OUT}/${nombre}`, buf);
  const txt = buf.toString("latin1");

  // Regla 2: si hay `over`, el PDF lo dice con el número; si no hay, no lo inventa.
  if (over > 0){
    check(/empalme/i.test(txt) && new RegExp(`${over}\\s+pieza`, "i").test(txt),
      `${nom}: hay ${over} pieza(s) > barra pero el PDF no las avisa con el número`);
  } else {
    check(!/empalme/i.test(txt), `${nom}: el PDF avisa empalme sin que haya piezas largas`);
  }
  // Regla 3: nada se estima en silencio.
  check(/sierra/i.test(txt), `${nom}: el PDF no aclara que el corte no descuenta la merma de sierra`);
  check(/referencia/i.test(txt), `${nom}: el PDF no aclara que los precios son de referencia`);

  if (esperaOver !== null) check(over > 0 === esperaOver, `${nom}: se esperaba over=${esperaOver} y dio ${over}`);

  // Dossier de cumplimiento: el papel que firma el profesional. Tiene que llevar el descargo (regla 4)
  // y el bloque de firma; si no, no sirve como entregable.
  const dossier = await exportDossier(input, { clima: { ciudad: "bahiablanca", zonaViento: "alta", nieve: "baja", zonaBio: "IV" }, out: "buffer" });
  const dbuf = Buffer.from(dossier.doc.output("arraybuffer"));
  writeFileSync(`${OUT}/${dossier.nombre}`, dbuf);
  const dtxt = dbuf.toString("latin1");
  check(/no calcula|profesional habilitado/i.test(dtxt), `${nom}: el dossier no lleva el descargo (regla 4)`);
  check(/firma/i.test(dtxt) && /matr[ií]cula/i.test(dtxt), `${nom}: el dossier no tiene bloque de firma/matrícula`);

  // Números para LEER (no sólo el dibujo).
  console.log(`\n${nom}`);
  console.log(`  cortables ${num(cortables)} · en barras ${num(enBarras)} · empalme ${num(over)}`);
  console.log(`  barras ${num(noFleje.reduce((a, pl) => a + pl.bins.length, 0))} · PDF → ${OUT}/${nombre}`);
  console.log(`  PDF dice: empalme ${/empalme/i.test(txt) ? "sí" : "no"} · sierra ${/sierra/i.test(txt) ? "sí" : "no"} · referencia ${/referencia/i.test(txt) ? "sí" : "no"}`);
  console.log(`  dossier → ${OUT}/${dossier.nombre} · descargo ${/no calcula|profesional/i.test(dtxt) ? "sí" : "no"} · firma ${/firma/i.test(dtxt) ? "sí" : "no"}`);
}

console.log("\n" + "─".repeat(58));
if (fail.length){
  console.error(`\n✗ ENTREGABLE CON DEFECTOS (${fail.length}):`);
  fail.forEach(f => console.error("  · " + f));
  process.exit(1);
}
console.log("✓ Entregable verificado. Abrí los PDF en ./.entregable/ y leé los números.\n");
