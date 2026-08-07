// ADAMANT · export del modelo 3D a OBJ (Wavefront). El 3D que el usuario diseñó, ahora suyo para abrir
// en SketchUp / Blender / cualquier visor. NO es cálculo: es la geometría pre-armada, la misma que el
// visor. Puro (sin DOM ni Three): corre igual en el navegador y en Node (backend, pared de pago).
//
// Cada pieza es un prisma (8 vértices · 6 caras). Las piezas con `orient` (cabriadas, correas, flejes,
// riostras) se emiten como su caja REAL rotada siguiendo su base { u, v, n }, no como su AABB — así el
// techo lee como triángulo y las diagonales quedan inclinadas, igual que en el visor y en el DXF.
// Se agrupan por CAPA (`g SOLERAS`, `g MONTANTES`…) para que en el destino se puedan seleccionar/pintar
// por sistema. Unidades: METROS (mm/1000), ejes X=ancho · Y=profundidad · Z=altura (Z-up, como Blender/SketchUp).
import { computeProject } from "../engine/index.mjs";
import { pieceBoxEngine } from "../engine/geometry.mjs";
import { capaDe } from "./dxf.mjs";

const R = n => +(+n / 1000).toFixed(4);   // mm → m con 4 decimales (0,1 mm)
// Caras del prisma como cuádruples de índices de vértice (0..7), vértice i = combinación de signos
// (sx,sy,sz) con bit(−1)=0 · bit(+1)=1  →  i = sx·4 + sy·2 + sz.
const FACES = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];

// 8 esquinas de una pieza en coords del motor (mm). Oriented → caja rotada por su base; si no, AABB.
function corners(p){
  const out = [];
  if (p.orient){
    const o = p.orient, c = o.c, ax = [[o.u, p.largo / 2], [o.v, o.w / 2], [o.n, o.t / 2]];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]){
      const s = [sx, sy, sz];
      out.push([0, 1, 2].map(i => c[i] + s[0] * ax[0][0][i] * ax[0][1] + s[1] * ax[1][0][i] * ax[1][1] + s[2] * ax[2][0][i] * ax[2][1]));
    }
  } else {
    const { size, center } = pieceBoxEngine(p);
    const h = [size[0] / 2, size[1] / 2, size[2] / 2];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1])
      out.push([center[0] + sx * h[0], center[1] + sy * h[1], center[2] + sz * h[2]]);
  }
  return out.every(v => v.every(Number.isFinite)) ? out : null;
}

// exportOBJ(input) → { obj, nombre }. `input` es el mismo que consume computeProject.
export function exportOBJ(input){
  const { piezas, metadatos } = computeProject(input);
  const sistema = metadatos?.sistema || input.sistema || "";
  const out = [
    "# Adamant · modelo 3D de estructura (Wavefront OBJ)",
    `# ${metadatos?.nombre || input.kind || "proyecto"}${sistema ? " · " + sistema : ""}`,
    "# Unidades: metros · Ejes: X=ancho, Y=profundidad, Z=altura (Z-up)"
  ];
  // Agrupar por capa: se ordena y se emite `g <capa>` cuando cambia. Los vértices son globales y las
  // caras los referencian por índice 1-based acumulado.
  const items = (piezas || []).map(p => ({ p, capa: capaDe(p.tipo) }))
    .sort((a, b) => a.capa < b.capa ? -1 : a.capa > b.capa ? 1 : 0);
  let vi = 0, capaAct = null;
  for (const { p, capa } of items){
    const cs = corners(p);
    if (!cs) continue;
    if (capa !== capaAct){ out.push(`g ${capa}`); capaAct = capa; }
    for (const c of cs) out.push(`v ${R(c[0])} ${R(c[1])} ${R(c[2])}`);
    for (const f of FACES) out.push(`f ${f.map(k => vi + k + 1).join(" ")}`);
    vi += 8;
  }
  const nombre = `adamant-${input.kind || "proyecto"}-${sistema}.obj`.replace(/-+\./, ".").replace(/-\.obj$/, ".obj");
  return { obj: out.join("\n") + "\n", nombre, piezas: piezas?.length || 0 };
}
