// ADAMANT · Glosario — FUENTE ÚNICA del contenido educativo (F14).
// Cada término tiene: t (nombre), def (qué es, 1-2 oraciones), fn (para qué sirve, 1 oración) y una
// mini-ilustración SVG de la pieza. En español rioplatense, directo, sin jerga sin explicar.
// Lo consumen: el glosario integrado (subrayado punteado + tarjeta), el "¿Qué es esto?" del 3D y las
// micro-explicaciones del wizard.
//
// `alias`: otras formas de escribir el término (para auto-subrayarlo en los textos).
// `tipos`: tipos de pieza del motor (palette) que mapean a esta entrada.

// SVG chico y consistente (64×44). Trazo teal sobre transparente; se pinta con currentColor.
const ico = inner => `<svg viewBox="0 0 64 44" class="gloss-svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

export const GLOSARIO = {
  montante: { t: "Montante", alias: ["montantes"], tipos: ["MONTANTE", "MONTANTE_CABRIADA"],
    def: "El parante vertical del muro, el perfil que se repite parado cada 40 o 60 cm.",
    fn: "Sostiene el muro y baja las cargas del techo hasta el piso.",
    svg: ico(`<rect x="26" y="6" width="12" height="32"/><path d="M20 8h24M20 36h24"/>`) },

  solera: { t: "Solera", alias: ["soleras", "solera de vano", "solera de dintel"], tipos: ["SOLERA", "SOL.PANEL", "SOL.VANO", "SOL.DINTEL"],
    def: "El perfil horizontal (en U) que corre arriba y abajo del muro; los montantes encastran adentro.",
    fn: "Ata los montantes en una línea y reparte la carga a lo largo del muro.",
    svg: ico(`<path d="M8 16h48v4H8zM8 16v8M56 16v8"/><rect x="22" y="20" width="8" height="16"/><rect x="38" y="20" width="8" height="16"/>`) },

  "double-top": { t: "Solera superior doble", alias: ["double top plate", "solera doble"],
    def: "En madera, la solera de arriba va doble (dos tablas encimadas).",
    fn: "Ata los muros entre sí y reparte mejor la carga del techo.",
    svg: ico(`<path d="M8 12h48M8 20h48"/><rect x="24" y="20" width="8" height="16"/><rect x="38" y="20" width="8" height="16"/>`) },

  king: { t: "King (montante de rey)", alias: ["king", "kings", "montante de rey"], tipos: ["KING"],
    def: "El montante entero que va a cada lado de una abertura, de solera a solera.",
    fn: "Enmarca el vano y lleva la carga del dintel hasta el piso.",
    svg: ico(`<rect x="10" y="6" width="7" height="32"/><rect x="47" y="6" width="7" height="32"/><path d="M17 12h30v6H17z"/>`) },

  jack: { t: "Jack (montante corto)", alias: ["jack", "jacks"], tipos: ["JACK"],
    def: "Un montante cortado que va pegado al king, más bajo: llega hasta el dintel.",
    fn: "Sostiene el dintel para que la carga de arriba baje al piso por el king.",
    svg: ico(`<rect x="12" y="6" width="6" height="32"/><rect x="20" y="18" width="6" height="20"/><rect x="46" y="6" width="6" height="32"/><rect x="38" y="18" width="6" height="20"/><path d="M20 14h24v4H20z"/>`) },

  dintel: { t: "Dintel", alias: ["dinteles", "cabezal de vano"], tipos: ["DINTEL"],
    def: "La viga horizontal arriba de una puerta o ventana. Si el vano es ancho, va reforzado (doble).",
    fn: "Salva el hueco de la abertura y pasa la carga de arriba a los jacks.",
    svg: ico(`<rect x="14" y="10" width="36" height="9"/><rect x="14" y="19" width="6" height="19"/><rect x="44" y="19" width="6" height="19"/>`) },

  cripple: { t: "Cripple", alias: ["cripples", "montante enano"], tipos: ["CRIPPLE"],
    def: "Montantitos cortos arriba del dintel (o abajo del antepecho de una ventana).",
    fn: "Continúan la modulación del muro por encima y por debajo del vano.",
    svg: ico(`<rect x="14" y="24" width="36" height="6"/><rect x="18" y="8" width="5" height="16"/><rect x="30" y="8" width="5" height="16"/><rect x="42" y="8" width="5" height="16"/>`) },

  antepecho: { t: "Antepecho", alias: ["antepechos", "alféizar", "sill"],
    def: "La altura de pared que queda debajo de una ventana, del piso al borde del vidrio.",
    fn: "Define a qué altura arranca la ventana; abajo lleva su propia solera.",
    svg: ico(`<rect x="10" y="6" width="44" height="32"/><rect x="18" y="10" width="28" height="16" fill="currentColor" fill-opacity="0.15"/><path d="M18 26h28"/>`) },

  arriostramiento: { t: "Arriostramiento", alias: ["arriostrar", "arriostrado"],
    def: "Lo que evita que el muro se deforme de costado (que se \"acueste\") con el viento o un empuje.",
    fn: "Le da rigidez al paño: puede ser una cruz de fleje o una placa de OSB.",
    svg: ico(`<rect x="10" y="6" width="44" height="32"/><path d="M10 6l44 32M54 6L10 38"/>`) },

  fleje: { t: "Fleje (Cruz de San Andrés)", alias: ["fleje", "flejes", "cruz de san andrés", "cruz de san andres"], tipos: ["FLEJE", "FLEJE_CIELO"],
    def: "Una tira fina de chapa galvanizada que se pone en diagonal, en cruz, sobre la cara del muro.",
    fn: "Arriostra el paño: trabaja a tracción y no lo deja deformarse de costado.",
    svg: ico(`<rect x="10" y="6" width="44" height="32"/><path d="M10 6l44 32M54 6L10 38" stroke-width="3"/>`) },

  cenefa: { t: "Cenefa", alias: ["cenefas", "rim", "viga de borde"], tipos: ["CENEFA"],
    def: "El perfil que cierra el contorno del entramado de piso, por fuera de las vigas.",
    fn: "Ata las puntas de todas las vigas y arma el marco del piso.",
    svg: ico(`<rect x="8" y="8" width="48" height="28"/><path d="M20 8v28M32 8v28M44 8v28"/>`) },

  viga: { t: "Viga (del piso)", alias: ["vigas", "vigueta", "joist"], tipos: ["VIGA", "VIGA_DOBLE"],
    def: "Los perfiles del entramado de piso que cruzan de lado a lado, parados de canto.",
    fn: "Sostienen la placa del piso y bajan su carga a los muros.",
    svg: ico(`<rect x="8" y="8" width="48" height="28"/><path d="M20 8v28M32 8v28M44 8v28"/>`) },

  blocking: { t: "Blocking", alias: ["blockings", "arriostre de vigas", "solera de traba"], tipos: ["BLOCKING"],
    def: "Piezas cortas trabadas entre viga y viga, a mitad de la luz del piso.",
    fn: "Evitan que las vigas se \"tuerzan\" de costado y reparten la carga entre ellas.",
    svg: ico(`<path d="M16 8v28M32 8v28M48 8v28"/><rect x="16" y="20" width="16" height="5"/><rect x="32" y="20" width="16" height="5"/>`) },

  trimmer: { t: "Trimmer (borde de vano)", alias: ["trimmers"], tipos: ["TRIMMER"],
    def: "La viga doble que bordea el hueco de una escalera o trampa en el piso.",
    fn: "Enmarca el hueco y recibe la carga de las vigas que se cortan.",
    svg: ico(`<rect x="8" y="8" width="48" height="28"/><rect x="22" y="8" width="4" height="28" fill="currentColor" fill-opacity="0.2"/><rect x="38" y="8" width="4" height="28" fill="currentColor" fill-opacity="0.2"/>`) },

  "cabezal-piso": { t: "Cabezal (del hueco)", alias: ["cabezal", "cabezales"], tipos: ["CABEZAL"],
    def: "La viga doble que cierra arriba y abajo el hueco del piso, entre los dos trimmers.",
    fn: "Recibe las vigas cortadas y pasa su carga a los trimmers.",
    svg: ico(`<rect x="8" y="8" width="48" height="28"/><rect x="20" y="14" width="24" height="4" fill="currentColor" fill-opacity="0.2"/><rect x="20" y="26" width="24" height="4" fill="currentColor" fill-opacity="0.2"/>`) },

  "viga-cola": { t: "Viga cola", alias: ["vigas cola"], tipos: ["VIGA_COLA"],
    def: "El tramo corto de una viga que quedó interrumpida por el hueco del piso.",
    fn: "Va de la cenefa al cabezal, completando el entramado alrededor del hueco.",
    svg: ico(`<rect x="8" y="8" width="48" height="28"/><path d="M14 8v12M26 8v12M14 26v12M26 26v12"/><rect x="10" y="18" width="24" height="4" fill="currentColor" fill-opacity="0.2"/>`) },

  cabriada: { t: "Cabriada", alias: ["cabriadas", "tijeral"],
    def: "El triángulo estructural del techo: cordones + diagonales armados como reticulado.",
    fn: "Salva la luz del techo y baja su carga a los dos muros de apoyo.",
    svg: ico(`<path d="M6 34h52L32 8z"/><path d="M32 8v26M19 34l13-13M45 34L32 21"/>`) },

  "cordon-superior": { t: "Cordón superior", alias: ["cordones superiores"], tipos: ["CORDON_SUPERIOR"],
    def: "El perfil inclinado de arriba de la cabriada, el que sigue la pendiente del techo.",
    fn: "Recibe las correas y la chapa, y lleva la carga hacia los apoyos.",
    svg: ico(`<path d="M6 34h52L32 8z"/><path d="M32 8L58 34" stroke-width="3"/>`) },

  "cordon-inferior": { t: "Cordón inferior", alias: ["cordón inferior", "cordones inferiores"], tipos: ["CORDON_INFERIOR"],
    def: "El perfil horizontal de abajo de la cabriada, que une los dos apoyos.",
    fn: "Cierra el triángulo y hace de vigueta del cielorraso.",
    svg: ico(`<path d="M6 34h52L32 8z"/><path d="M6 34h52" stroke-width="3"/>`) },

  diagonal: { t: "Diagonal (de la cabriada)", alias: ["diagonal", "diagonales", "montante de cabriada", "pendolón"], tipos: ["DIAGONAL", "MONTANTE_CABRIADA", "MONTANTE_TIMPANO"],
    def: "Las barras internas de la cabriada que arman la \"W\" entre los cordones.",
    fn: "Triangulan el reticulado: sin ellas la cabriada se abriría.",
    svg: ico(`<path d="M6 34h52L32 8z"/><path d="M32 8v26M19 34l13-13M45 34L32 21"/>`) },

  correa: { t: "Correa", alias: ["correas", "omega"], tipos: ["CORREA"],
    def: "Los perfiles (tipo Omega) que corren cruzados sobre los cordones superiores.",
    fn: "Sostienen la chapa del techo y reparten su carga a las cabriadas.",
    svg: ico(`<path d="M8 30L32 12l24 18"/><path d="M14 20h36M20 12h24" stroke-width="3"/>`) },

  vela: { t: "Vela", alias: ["velas", "pendola", "colgante"], tipos: ["VELA"],
    def: "Los perfiles verticales cortos que cuelgan el cielorraso de la losa o del techo.",
    fn: "Sostienen las vigas maestras a la altura que uno quiere el cielorraso.",
    svg: ico(`<path d="M8 12h48"/><path d="M20 12v14M44 12v14"/><path d="M12 34h40"/>`) },

  maestra: { t: "Viga maestra", alias: ["vigas maestras", "maestra", "maestras"], tipos: ["MAESTRA"],
    def: "Los perfiles largos del nivel de arriba del cielorraso, de los que cuelga todo.",
    fn: "Reciben las velas y sostienen los montantes que llevan la placa.",
    svg: ico(`<path d="M8 16h48" stroke-width="3"/><path d="M18 16v-6M46 16v-6"/><path d="M8 28h48M20 16v12M32 16v12M44 16v12"/>`) },

  platea: { t: "Platea", alias: ["plateas", "losa de fundación"], tipos: ["PLATEA"],
    def: "La losa de hormigón apoyada en el terreno sobre la que se para toda la estructura.",
    fn: "Reparte el peso de la casa en el suelo y da el nivel del piso.",
    svg: ico(`<rect x="6" y="24" width="52" height="12" fill="currentColor" fill-opacity="0.15"/><path d="M18 24v-8M32 24v-8M46 24v-8"/>`) },

  pilotin: { t: "Pilotín", alias: ["pilotines", "pilote"], tipos: ["PILOTIN", "SOLERA_ASIENTO"],
    def: "Columnas de hormigón enterradas que sostienen el piso en puntos, en vez de una losa maciza.",
    fn: "Apoyan la estructura en el terreno firme, salteando el relleno.",
    svg: ico(`<path d="M8 20h48"/><rect x="14" y="20" width="8" height="18" rx="4" fill="currentColor" fill-opacity="0.15"/><rect x="42" y="20" width="8" height="18" rx="4" fill="currentColor" fill-opacity="0.15"/>`) },

  revestimiento: { t: "Revestimiento", alias: ["revestimientos", "placa de revestimiento"], tipos: ["REV.EXT", "REV.INT", "PLACA"],
    def: "Las placas que cierran el muro por fuera y por dentro (yeso, OSB, cementicia…).",
    fn: "Cierran la estructura, dan la terminación y ayudan a arriostrar.",
    svg: ico(`<rect x="10" y="8" width="44" height="28"/><path d="M10 8l44 28" stroke-opacity="0.3"/>`) },

  modulacion: { t: "Modulación", alias: ["modulación", "modular", "O.C."],
    def: "La distancia fija entre montantes (o vigas): 40 cm o 60 cm, de eje a eje.",
    fn: "Ordena la estructura y hace que las placas caigan justas sobre los perfiles.",
    svg: ico(`<path d="M14 8v28M32 8v28M50 8v28"/><path d="M14 22h18M32 22h18"/><path d="M20 19v6M26 19v6M38 19v6M44 19v6" stroke-opacity="0.5"/>`) },

  alero: { t: "Alero", alias: ["aleros"],
    def: "La parte del techo que sobresale más allá del muro.",
    fn: "Protege la pared de la lluvia y da sombra a las aberturas.",
    svg: ico(`<path d="M6 20h52L32 6z"/><path d="M6 20l-0 6M58 20v6"/>`) },

  luz: { t: "Luz", alias: [],
    def: "La distancia libre que cruza una viga o una cabriada, de apoyo a apoyo.",
    fn: "Cuanto mayor es la luz, más resistente tiene que ser el perfil.",
    svg: ico(`<path d="M10 30h44"/><path d="M10 24v12M54 24v12"/><path d="M14 30l4-3M14 30l4 3M50 30l-4-3M50 30l-4 3"/>`) },

  timpano: { t: "Tímpano", alias: ["tímpanos", "hastial"], tipos: [],
    def: "El triángulo de pared que cierra el techo a dos aguas en cada punta.",
    fn: "Tapa el hueco entre el muro y los faldones del techo.",
    svg: ico(`<path d="M8 34h48L32 10z"/><path d="M22 34V22M32 34V16M42 34V22"/>`) }
};

// Índice: tipo de pieza (palette) → slug del glosario.
const PORTIPO = {};
for (const [slug, e] of Object.entries(GLOSARIO)) (e.tipos || []).forEach(t => { PORTIPO[t] = slug; });
export const glossKeyForTipo = tipo => PORTIPO[tipo] || null;
export const getGloss = slug => GLOSARIO[slug] || null;
export const glossForTipo = tipo => GLOSARIO[PORTIPO[tipo]] || null;

// --- auto-subrayado de términos en un TEXTO PLANO (no HTML) ---
// Arma un regex con todos los términos y alias (los más largos primero, para que "viga maestra" gane a
// "viga"). Envuelve cada aparición en <span class="gloss" data-g="slug">…</span>. Marca cada slug una
// sola vez por texto (para no llenar de subrayados). Sólo para strings sin HTML.
const ENTRADAS = Object.entries(GLOSARIO).flatMap(([slug, e]) =>
  [e.t.toLowerCase(), ...(e.alias || [])].map(term => ({ slug, term })))
  .sort((a, b) => b.term.length - a.term.length);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const RE = new RegExp(`(?<![\\p{L}])(${ENTRADAS.map(e => esc(e.term)).join("|")})(?![\\p{L}])`, "giu");

export function glossHTML(text){
  if (!text) return text || "";
  const usados = new Set();
  return String(text).replace(RE, (m) => {
    const low = m.toLowerCase();
    const hit = ENTRADAS.find(e => e.term === low);
    if (!hit || usados.has(hit.slug)) return m;
    usados.add(hit.slug);
    return `<span class="gloss" data-g="${hit.slug}">${m}</span>`;
  });
}
