// Pipeline de validación de Adamant.
// 1) Extrae el <script> del HTML y corre node --check (sintaxis JS).
// 2) Genera scripts .rb de muestra (tools/gen-samples.js).
// 3) Si hay `ruby` instalado: ruby -c de cada .rb + ejecución contra el stub de SketchUp.
//
// Uso: node tools/validate.js   (o: npm run validate)
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'adamant-generador-scripts.html');
const OUT = path.join(__dirname, 'out');
const STUB = path.join(__dirname, 'su_stub.rb');

let fail = false;
const ok = (m) => console.log('  \x1b[32m✓\x1b[0m ' + m);
const err = (m) => { console.log('  \x1b[31m✗\x1b[0m ' + m); fail = true; };

// ---- 1) Sintaxis JS ----
console.log('1) Sintaxis JS');
const html = fs.readFileSync(HTML, 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { err('No se encontró el <script> en el HTML'); process.exit(1); }
const tmpJs = path.join(os.tmpdir(), 'adamant_check.js');
fs.writeFileSync(tmpJs, m[1]);
const chk = spawnSync('node', ['--check', tmpJs], { encoding: 'utf8' });
if (chk.status === 0) ok('node --check OK'); else err('node --check:\n' + chk.stderr);

// ---- 2) Generar .rb de muestra ----
console.log('2) Generar Ruby de muestra');
const gen = spawnSync('node', [path.join(__dirname, 'gen-samples.js')], { encoding: 'utf8' });
if (gen.status === 0) ok(gen.stdout.trim()); else err('gen-samples:\n' + (gen.stderr || gen.stdout));

// ---- 3) Ruby (si está disponible) ----
console.log('3) Ruby (sintaxis + ejecución contra el stub)');
let hasRuby = false;
try { execSync('ruby -v', { stdio: 'ignore' }); hasRuby = true; } catch (e) {}
if (!hasRuby) {
  console.log('  \x1b[33m·\x1b[0m ruby no instalado — se omite (instalá ruby para el test completo).');
} else if (fs.existsSync(OUT)) {
  const rbs = fs.readdirSync(OUT).filter(f => f.endsWith('.rb'));
  for (const f of rbs) {
    const full = path.join(OUT, f);
    const c = spawnSync('ruby', ['-c', full], { encoding: 'utf8' });
    if (c.status !== 0) { err(`${f} sintaxis:\n${c.stderr}`); continue; }
    // ejecución: el stub carga el .rb indicado por ADAMANT_RB
    const r = spawnSync('ruby', [STUB], { encoding: 'utf8', env: { ...process.env, ADAMANT_RB: full } });
    if (r.status === 0) ok(`${f} · ${(r.stdout.trim().split('\n').pop() || '').slice(0, 80)}`);
    else err(`${f} runtime:\n${r.stderr}`);
  }
}

console.log(fail ? '\n\x1b[31mFALLÓ la validación.\x1b[0m' : '\n\x1b[32mTodo OK.\x1b[0m');
process.exit(fail ? 1 : 0);
