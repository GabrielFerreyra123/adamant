// ADAMANT · Solver de encuentro de esquina (y encuentro en T — misma lógica, ver Tarea 4).
// En cada esquina el muro PASANTE lleva un montante extremo DOBLE (cajón, dos perfiles) y el muro
// ENCAJADO un montante de ARRANQUE que apoya contra el alma del doble. Resultado: 3 montantes en
// contacto, sin hueco ni superposición. Se generan como piezas de `piezas[]` (computan y cortan).
//
// Coordenadas del ambiente (mm). El montante es vertical (eje Z). Su huella en planta: `cf` (ala) a lo
// largo del muro × `e` (espesor de muro) hacia adentro. `c` = esquina EXTERIOR [x,y]; `p` = versor del
// PASANTE hacia el interior (a lo largo del pasante); `q` = versor del ENCAJADO hacia el interior.

// Caja alineada a ejes a partir de un origen y dos direcciones ±X/±Y unitarias.
function caja(o, aDir, aLen, bDir, bLen, hmon, zb){
  const cx = o[0] + aDir[0]*aLen/2 + bDir[0]*bLen/2;
  const cy = o[1] + aDir[1]*aLen/2 + bDir[1]*bLen/2;
  const sx = Math.abs(aDir[0])*aLen + Math.abs(bDir[0])*bLen;
  const sy = Math.abs(aDir[1])*aLen + Math.abs(bDir[1])*bLen;
  return { size: [sx, sy, hmon], center: [cx, cy, zb + hmon/2] };
}

// → array de 3 piezas montante (2 esquina del pasante + 1 arranque del encajado). `parteP`/`parteE`
// marcan a qué muro pertenece cada una (para "ver por partes" y el test AABB entre partes).
export function postesEsquina({ c, p, q, e, cf, perfil, hmon, zb, mat = "montante", parteP, parteE }){
  const pieza = (tipo, box, parte) => ({ tipo, perfil, largo: Math.round(hmon), axis: "z", mat,
    pos: [box.center[0] - box.size[0]/2, box.center[1] - box.size[1]/2, zb], box, parte });
  // PASANTE — doble: dos montantes en el extremo, ala (cf) a lo largo del pasante, alma (e) hacia adentro (q).
  const A = pieza("MONTANTE_ESQUINA", caja(c, p, cf, q, e, hmon, zb), parteP);
  const B = pieza("MONTANTE_ESQUINA", caja([c[0] + p[0]*cf, c[1] + p[1]*cf], p, cf, q, e, hmon, zb), parteP);
  // ENCAJADO — arranque: ala (cf) a lo largo del encajado (q), alma (e) hacia adentro (p), arrancando a
  // `e` del exterior → apoya cara a cara contra el alma del doble (contacto a 0 mm en la cara del pasante).
  const C = pieza("MONTANTE_ARRANQUE", caja([c[0] + q[0]*e, c[1] + q[1]*e], q, cf, p, e, hmon, zb), parteE);
  return [A, B, C];
}

// Tornillos T1 de un encuentro: unión del doble (a lo alto) + unión arranque↔doble. 2 uniones × ceil(alto/600).
export function t1Esquina(alto, sep = 600){ return 2 * Math.max(1, Math.ceil(alto / sep)); }
