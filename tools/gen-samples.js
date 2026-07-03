// Genera scripts Ruby de muestra desde el HTML, para validar los generadores.
// Uso: node tools/gen-samples.js  → escribe en tools/out/*.rb
const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, '..', 'adamant-generador-scripts.html');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const html = fs.readFileSync(HTML, 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error('No se encontró el <script> en el HTML'); process.exit(1); }

// Cortamos antes del código que toca el DOM al final.
let js = m[1].split("document.querySelectorAll('.tab')")[0];

// Stubs mínimos de entorno navegador para poder evaluar los generadores.
global.localStorage = { _d: {}, getItem(k){ return this._d[k] || null; }, setItem(k,v){ this._d[k]=v; } };
global.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };

// eslint-disable-next-line no-eval
eval(js);

const rooms = [
  { nombre:'Living', largo:4000, ancho:3500, posX:0, posY:0, vanos:[
    { lado:'frente', tipo:'Ventana', pos:1200, ancho:1200, alto:1100, sill:900 },
    { lado:'der',    tipo:'Puerta',  pos:1000, ancho:800,  alto:2050, sill:0 } ] },
  { nombre:'Dorm', largo:3500, ancho:3500, posX:3898, posY:0, vanos:[
    { lado:'izq', tipo:'Puerta', pos:1000, ancho:800, alto:2050, sill:0 } ] },
];

const base = {
  pgc:'PGC 100x0.90', pgu:'PGU 100x0.90', lumber:'2x6 (38×140)',
  altura:2600, modulo:400, revInt:'Durlock 12.5', revExt:'OSB / Fenólico 10',
  techoOn:true, techoTipo:'Dos aguas', pendiente:30, sepCab:1200, alero:300,
  plateaOn:true, espesor:120, vuelo:200,
  entrepisoOn:true, nivelEnt:2700, sepViga:400,
  esquinasOn:true, bracesOn:true, placasOn:true, etiquetasOn:false, rooms,
};

const write = (name, code) => { fs.writeFileSync(path.join(OUT, name), code); return code; };
let count = 0;

// Muro steel + wood
write('muro_steel.rb', scriptMuro({ sistema:'steel', largo:3000, altura:2600, modulo:400,
  pgcAlma:100, pgcAla:40, pgcLabio:15, pgcEsp:0.9, pguAlma:102, pguAla:35, pguEsp:0.9 })); count++;
write('muro_wood.rb', scriptMuro({ sistema:'wood', lumber:'2x6 (38×140)', largo:3000, altura:2600, modulo:400 })); count++;

// Cielorraso
write('cielo.rb', scriptCielo({ largo:4000, ancho:3000, alt:2400, modulo:400, alma:70, ala:30, esp:0.94 })); count++;

// Casa: steel (4 techos) + wood + etiquetado
['Dos aguas','Una agua','Plano','Cuatro aguas'].forEach(t => {
  write(`casa_steel_${t.replace(/ /g,'_')}.rb`, scriptCasa({ ...base, sistema:'steel', techoTipo:t })); count++;
});
write('casa_wood.rb', scriptCasa({ ...base, sistema:'wood' })); count++;
write('casa_etiquetas.rb', scriptCasa({ ...base, sistema:'steel', etiquetasOn:true })); count++;

console.log(`OK · ${count} scripts .rb generados en tools/out/`);
