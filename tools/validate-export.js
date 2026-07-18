// Verifica el export Ruby (F5): corre los .rb generados por el motor contra el stub de SketchUp
// y comprueba PARIDAD con el generador legacy (scriptMuro del HTML) para muros sin vanos.
// Uso: node tools/validate-export.js
const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.join(__dirname, "..");
const HTML = path.join(ROOT, "adamant-generador-scripts.html");
const OUT = path.join(__dirname, "out");
const STUB = path.join(__dirname, "su_stub.rb");
fs.mkdirSync(OUT, { recursive: true });

let fail = false;
const ok = m => console.log("  \x1b[32m✓\x1b[0m " + m);
const bad = m => { console.log("  \x1b[31m✗\x1b[0m " + m); fail = true; };

// --- legacy scriptMuro (extraído del HTML, como gen-samples) ---
const html = fs.readFileSync(HTML, "utf8");
const js = html.match(/<script>([\s\S]*)<\/script>/)[1].split("document.querySelectorAll('.tab')")[0];
global.localStorage = { _d:{}, getItem(k){return this._d[k]||null;}, setItem(k,v){this._d[k]=v;} };
global.document = { getElementById:()=>null, querySelectorAll:()=>[], querySelector:()=>null };
eval(js);
const scriptMuroLegacy = scriptMuro; // del HTML

function pieces(rb, name){
  const file = path.join(OUT, name);
  fs.writeFileSync(file, rb);
  const c = spawnSync("ruby", ["-c", file], { encoding: "utf8" });
  if (c.status !== 0){ bad(`${name} sintaxis:\n${c.stderr}`); return null; }
  const r = spawnSync("ruby", [STUB], { encoding: "utf8", env: { ...process.env, ADAMANT_RB: file } });
  if (r.status !== 0){ bad(`${name} runtime:\n${r.stderr}`); return null; }
  const mm = (r.stdout.match(/PERFILES GENERADOS:\s*(\d+)/) || [])[1];
  return mm ? +mm : null;
}

(async () => {
  let hasRuby = false;
  try { execSync("ruby -v", { stdio: "ignore" }); hasRuby = true; } catch {}
  if (!hasRuby){ console.log("ruby no instalado — se omite."); process.exit(0); }

  const { exportRuby } = await import(pathToFileURL(path.join(ROOT, "src/export/ruby.mjs")).href);
  const { piso } = await import(pathToFileURL(path.join(ROOT, "src/engine/modules/piso.mjs")).href);
  const { cielo } = await import(pathToFileURL(path.join(ROOT, "src/engine/modules/cielo.mjs")).href);
  const { combinado } = await import(pathToFileURL(path.join(ROOT, "src/engine/modules/combinado.mjs")).href);

  // 1) PARIDAD sin vanos: motor vs legacy, mismo nº de piezas
  console.log("1) Paridad sin vanos (motor vs legacy)");
  const casos = [
    ["steel", { sistema:"steel", largo:3000, alto:2600, vanos:[], opciones:{ modulo:400, pgc:"PGC 100x0.90", pgu:"PGU 100x0.90" } },
              { sistema:"steel", largo:3000, altura:2600, modulo:400, pgcAlma:100, pgcAla:40, pgcLabio:15, pgcEsp:0.9, pguAlma:102, pguAla:35, pguEsp:0.9 }],
    ["wood",  { sistema:"wood", largo:3000, alto:2600, vanos:[], opciones:{ modulo:400, lumber:"2x6 (38×140)" } },
              { sistema:"wood", lumber:"2x6 (38×140)", largo:3000, altura:2600, modulo:400 }]
  ];
  for (const [sis, inp, legacyP] of casos){
    const nM = pieces(exportRuby(inp), `export_${sis}_novano.rb`);
    const nL = pieces(scriptMuroLegacy(legacyP), `legacy_${sis}_novano.rb`);
    if (nM == null || nL == null) continue;
    if (nM === nL) ok(`${sis}: motor ${nM} == legacy ${nL} piezas`);
    else bad(`${sis}: motor ${nM} != legacy ${nL} piezas`);
  }

  // 2) Export con vanos: corre sin errores
  console.log("2) Export con vanos (corre sin errores)");
  const vanoCases = {
    steel_puerta:  { sistema:"steel", largo:3000, alto:2600, vanos:[{ x1:1050, x2:1950, h:2050, sill:0 }], opciones:{ modulo:400 } },
    steel_ventana: { sistema:"steel", largo:4000, alto:2600, vanos:[{ x1:1400, x2:2600, h:2100, sill:900 }], opciones:{ modulo:400 } },
    wood_mix:      { sistema:"wood", largo:5000, alto:2600, vanos:[{ x1:500, x2:1400, h:2050, sill:0 }, { x1:2500, x2:4000, h:2100, sill:900 }], opciones:{ modulo:400 } }
  };
  for (const [name, inp] of Object.entries(vanoCases)){
    const n = pieces(exportRuby(inp), `export_${name}.rb`);
    if (n != null) ok(`${name} · ${n} piezas`);
  }

  // 3) Módulo piso: paridad geométrica (cada pieza del motor → un _profile en el .rb)
  console.log("3) Export piso (paridad de piezas motor ↔ .rb)");
  const pisoCases = [
    ["steel", { pgc:"PGC 150x1.60", pgu:"PGU 150x1.60" }],
    ["wood",  { lumber:"2x8 (38×184)" }]
  ];
  for (const [sis, opt] of pisoCases){
    const inp = { kind:"piso", sistema:sis, largo:4000, ancho:5000, separacion:400, apoyo:"platea", placa:true, opciones:opt };
    const nEngine = piso.generar(inp).piezas.length;
    const nRb = pieces(exportRuby(inp), `export_piso_${sis}.rb`);
    if (nRb == null) continue;
    if (nRb === nEngine) ok(`piso ${sis}: motor ${nEngine} == .rb ${nRb} piezas`);
    else bad(`piso ${sis}: motor ${nEngine} != .rb ${nRb}`);
  }

  // 4) Módulo cielorraso: paridad geométrica (cada pieza del motor → un _profile en el .rb)
  console.log("4) Export cielorraso (paridad de piezas motor ↔ .rb)");
  const cieloInp = { kind:"cielo", sistema:"steel", largo:4000, ancho:3000, alt:2600, suspension:400, modulo:400, opciones:{ perfil:"Solera/montante 70" } };
  const nCE = cielo.generar(cieloInp).piezas.length;
  const nCRb = pieces(exportRuby(cieloInp), `export_cielo.rb`);
  if (nCRb != null){
    if (nCRb === nCE) ok(`cielo: motor ${nCE} == .rb ${nCRb} piezas`);
    else bad(`cielo: motor ${nCE} != .rb ${nCRb}`);
  }

  // 5) Módulo combinado (ambiente completo): paridad de piezas motor ↔ .rb (con reubicación/xf)
  console.log("5) Export combinado (piso + 4 muros, con xf de reubicación)");
  const combInp = { kind:"combinado", sistema:"steel", largo:4000, ancho:3000, alto:2600, apoyo:"platea", placa:true,
    opciones:{ pgc:"PGC 100x0.90", pgu:"PGU 100x0.90", modulo:400 }, vanoFrente:[], vanoFondo:[], vanoIzq:[], vanoDer:[] };
  // el export excluye los revestimientos (capas visuales "a definir"); la placa de piso sí va
  const nCombE = combinado.generar(combInp).piezas.filter(p => p.capa !== "rev-ext" && p.capa !== "rev-int").length;
  const nCombRb = pieces(exportRuby(combInp), `export_combinado.rb`);
  if (nCombRb != null){
    if (nCombRb === nCombE) ok(`combinado: motor ${nCombE} == .rb ${nCombRb} piezas`);
    else bad(`combinado: motor ${nCombE} != .rb ${nCombRb}`);
  }

  console.log(fail ? "\n\x1b[31mFALLÓ.\x1b[0m" : "\n\x1b[32mExport Ruby OK.\x1b[0m");
  process.exit(fail ? 1 : 0);
})();
