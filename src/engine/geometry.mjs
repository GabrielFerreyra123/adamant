// ADAMANT · geometría de piezas (puro, sin Three.js ni DOM → testeable y usable desde el motor).
// Cada pieza del motor trae { tipo, perfil, largo, pos:[x,y,z], axis } en coordenadas del MOTOR:
//   X = largo del muro/corrida · Y = profundidad (espesor) · Z = altura (piso z=0).
// Acá se calcula la caja (size + center) de cada pieza EN COORDENADAS DEL MOTOR, respetando su eje.
// Una pieza puede traer `p.box` (AABB ya resuelto en coords del motor): se usa tal cual — así el módulo
// combinado puede reubicar (rotar/trasladar/elevar) piezas de submódulos sin reimplementar secciones.
import { PGC, PGU, LUMBER, CIELO, PGC_ALA, PGU_ALA } from "./systems.mjs";

// Sección aproximada del perfil (mm): { b: ala/espesor, h: alma/ancho }.
export function secDims(perfil){
  if (PGC[perfil]) return { b: PGC_ALA, h: PGC[perfil].a };
  if (PGU[perfil]) return { b: PGU_ALA, h: PGU[perfil].a };
  if (LUMBER[perfil]) return { b: LUMBER[perfil].e, h: LUMBER[perfil].a };
  if (CIELO[perfil]) return { b: CIELO[perfil].fl, h: CIELO[perfil].a };
  return { b: 40, h: 100 };
}

// Piezas DE CANTO (alma vertical, en Z) también cuando corren en X: dintel del muro y todo el
// entramado de piso / grilla de cielorraso (viga, viga doble, cenefa, blocking, solera, montante, maestra).
const CANTO = new Set(["DINTEL", "VIGA", "VIGA_DOBLE", "CENEFA", "BLOCKING", "SOLERA", "MONTANTE", "MAESTRA",
  "TRIMMER", "CABEZAL", "VIGA_COLA"]); // enmarcado del vano de piso: mismo armado que la viga

// Caja de una pieza en coordenadas del motor (mm). size y center en [x, y, z].
export function pieceBoxEngine(p){
  if (p.box) return p.box; // AABB ya resuelto (piezas reubicadas por el combinado)
  // Pieza DIAGONAL (fleje de arriostramiento): no tiene `axis`, sino una base propia
  // { c, u, v, n, w, t }. La AABB es la proyección de la caja rotada sobre los ejes del motor:
  // medio-tamaño = Σ |eje_i| · medio-extensión_i.
  if (p.orient){
    const o = p.orient, ejes = [[o.u, p.largo/2], [o.v, o.w/2], [o.n, o.t/2]];
    const half = [0, 0, 0];
    ejes.forEach(([e, h]) => { for (let i = 0; i < 3; i++) half[i] += Math.abs(e[i]) * h; });
    return { size: [half[0]*2, half[1]*2, half[2]*2], center: o.c.slice() };
  }
  const { b, h } = secDims(p.perfil), L = p.largo; // b = ala/espesor, h = alma/ancho
  // VELA: recorte de montante PARADO (vertical) como stub cuadrado b×b que sube desde el entramado.
  if (p.tipo === "VELA"){ const [ox, oy, oz] = p.pos; return { size: [b, b, L], center: [ox + b/2, oy + b/2, oz + L/2] }; }
  let sx, sy, sz;
  if (p.axis === "z")           { sx = b; sy = h; sz = L; }  // vertical (montante): X=ala, Y=alma, Z=largo
  else if (p.axis === "y")      { sx = b; sy = L; sz = h; }  // corre en Y de canto: X=ala, Y=largo, Z=alma
  else if (CANTO.has(p.tipo))   { sx = L; sy = b; sz = h; }  // corre en X DE CANTO: X=largo, Y=ala, Z=alma
  else                          { sx = L; sy = h; sz = b; }  // solera del muro (acostada): Y=alma, Z=espesor
  const [ox, oy, oz] = p.pos;
  return { size: [sx, sy, sz], center: [ox + sx/2, oy + sy/2, oz + sz/2] };
}

// AABB del conjunto en coordenadas del motor (mm).
export function boundsEngine(piezas){
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  (piezas || []).forEach(p => {
    const { size, center } = pieceBoxEngine(p);
    for (let i = 0; i < 3; i++){ min[i] = Math.min(min[i], center[i] - size[i]/2); max[i] = Math.max(max[i], center[i] + size[i]/2); }
  });
  return { min, max, size: [max[0]-min[0], max[1]-min[1], max[2]-min[2]] };
}

// AABB en la convención de Three (Y-up): motor (x,y,z) → three (x, z, y).
export function boundsThree(piezas){
  const { size } = boundsEngine(piezas);
  return { size: [size[0], size[2], size[1]] }; // [X, Y(alto), Z(prof)]
}
