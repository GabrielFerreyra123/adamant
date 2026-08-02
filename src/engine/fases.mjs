// ADAMANT · fases de obra (timeline de montaje). Deriva del modelo el ORDEN en que se arma la
// estructura y qué entra en cada etapa, en criollo, para llevar a obra. No inventa piezas: cuenta
// las que ya calculó el motor (computeProject) y las agrupa por etapa constructiva.
//
// Puro (sin DOM ni Three). El orden es el del entramado de plataforma (platform framing).
import { computeProject } from "./index.mjs";

// Etapas en orden de montaje. Cada una junta uno o más `tipo` de pieza del motor.
const ETAPAS = [
  { id: "fundacion", titulo: "Fundación y apoyos", tipos: ["PLATEA", "PILOTIN", "SOLERA_ASIENTO"],
    nota: "Nivelá la base. Es lo único húmedo: dejá fraguar antes de apoyar la estructura." },
  { id: "soleras", titulo: "Soleras y anclaje a la base", tipos: ["SOL.PANEL"],
    nota: "Fijá la solera inferior a la platea con los anclajes ANTES de parar los montantes. La solera superior cierra el paño arriba." },
  { id: "montantes", titulo: "Montantes (parantes)", tipos: ["MONTANTE", "MONTANTE_ESQUINA", "MONTANTE_ARRANQUE"],
    nota: "Parálos en la modulación (cada 40 cm). Aplomá y trabá las esquinas." },
  { id: "vanos", titulo: "Aberturas: dinteles y refuerzos", tipos: ["KING", "JACK", "DINTEL", "CABEZAL", "CRIPPLE", "SOL.VANO", "SOL.DINTEL"],
    nota: "Armá cada abertura: montante de borde (king), el corto que apoya el dintel (jack), el dintel y los refuerzos arriba/abajo." },
  { id: "arriostre", titulo: "Arriostres (Cruz de San Andrés)", tipos: ["FLEJE"],
    nota: "Colocá los flejes en diagonal y tensálos. Esto es lo que mantiene el paño a escuadra contra el viento." },
  { id: "entrepiso", titulo: "Entrepiso", tipos: ["VIGA", "VIGA_DOBLE", "CENEFA", "BLOCKING", "PLACA", "VELA"],
    nota: "Vigas salvando la luz menor, cenefa en el perímetro y blocking a mitad de luz. Después, la placa de piso." },
  { id: "techo", titulo: "Techo: cabriadas y correas", tipos: ["CORDON_SUPERIOR", "CORDON_INFERIOR", "DIAGONAL", "MONTANTE_CABRIADA", "MONTANTE_TIMPANO", "PENDOLON", "LIMATESA", "CUMBRERA", "VIGA_COLA", "CORREA"],
    nota: "Armá las cabriadas abajo y súbelas. Ancladas al muro (succión de viento) y arriostradas entre sí. Después las correas." },
  { id: "cubierta", titulo: "Cubierta", tipos: ["CUBIERTA"],
    nota: "La chapa sobre las correas, con su cumbrera y babetas. Recién acá el modelo queda a cubierta del agua." },
  { id: "cielo", titulo: "Cielorraso", tipos: ["SOLERA", "MAESTRA", "FLEJE_CIELO"],
    nota: "La grilla suspendida cuelga de la estructura de arriba. Va al final, ya bajo techo." }
];

// Deriva las fases de obra del proyecto. → { fases:[{orden,id,titulo,nota,piezas}], total }
export function fasesDeObra(input){
  const { piezas } = computeProject(input);
  const cuenta = {};
  (piezas || []).forEach(p => { cuenta[p.tipo] = (cuenta[p.tipo] || 0) + 1; });
  const fases = [];
  for (const e of ETAPAS){
    const n = e.tipos.reduce((a, t) => a + (cuenta[t] || 0), 0);
    if (n > 0) fases.push({ orden: fases.length + 1, id: e.id, titulo: e.titulo, nota: e.nota, piezas: n });
  }
  // Detalle del tipo de apoyo en la fundación (platea / pilotines), si aplica.
  const fund = fases.find(f => f.id === "fundacion");
  if (fund && input.apoyo) fund.nota = (input.apoyo === "pilotines"
    ? "Pilotines nivelados con su viga de encadenado. "
    : "Platea de hormigón nivelada. ") + "Es lo único húmedo: dejá fraguar antes de apoyar la estructura.";
  return { fases, total: fases.length };
}
