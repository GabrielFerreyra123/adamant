// ADAMANT · geometría del muro/tabique — port de `_wall` (Ruby) a JS puro.
// Devuelve la lista de piezas 3D (para el visor). Cada pieza:
//   { tipo, perfil, largo(mm), pos:[x,y,z](mm), axis:'x'|'y'|'z', mat }
// Coordenadas: X = largo del muro, Y = espesor, Z = altura (igual que el generador Ruby).
import { resolveSystem, DINTEL_SIMPLE_MAX } from "./systems.mjs";

export function buildPieces(input){
  const s = resolveSystem(input);
  const wood = s.wood;
  const larg = +input.largo, ALTURA = +input.alto, MODULO = s.modulo;
  const vanos = (input.vanos||[]).map(v => ({ x1:+v.x1, x2:+v.x2, h:+v.h, sill:+v.sill||0 }));
  const P = [];
  const SOL = { perfil:s.perfilSol, name:"solera" }, MON = { perfil:s.perfilMont, name:"montante" };
  const add = (tipo, largo, pos, axis, m) => { if (largo > 1) P.push({ tipo, perfil:m.perfil, largo:Math.round(largo), pos, axis, mat:m.name }); };

  // alturas de referencia (idéntico a _wall)
  let zb, ztopC, hmon, cf = s.cf, headH = s.headH;
  if (wood){ zb = s.te; ztopC = ALTURA - 2*s.te; hmon = ztopC - zb; }
  else { zb = s.t; ztopC = ALTURA - s.fl; hmon = ALTURA - 2*s.t; }

  // --- solera/durmiente inferior, cortada en umbrales (sill<=zb) ---
  const cortes = vanos.filter(v => v.sill <= zb + 1).map(v => [v.x1, v.x2]).sort((a,b) => a[0]-b[0]);
  let sx = 0;
  cortes.forEach(([q1,q2]) => { add("SOL.PANEL", q1 - sx, [sx,0,0], "x", SOL); sx = q2; });
  add("SOL.PANEL", larg - sx, [sx,0,0], "x", SOL);

  // --- solera superior (simple steel / doble madera) ---
  if (wood){ add("SOL.PANEL", larg, [0,0,ALTURA-s.te], "x", SOL); add("SOL.PANEL", larg, [0,0,ALTURA-2*s.te], "x", SOL); }
  else add("SOL.PANEL", larg, [0,0,ALTURA-s.fl], "x", SOL);

  // --- montantes en la modulación, salteando vanos ---
  // Regla de conteo (A): un montante en CADA línea de modulación (0, MODULO, 2·MODULO, …)
  // MÁS un montante de cierre en el extremo del muro (`larg`), clampeado para quedar al ras
  // (origen ≤ larg-cf). Equivale a ceil(larg/MODULO)+1. Si `larg` no es múltiplo del módulo,
  // el último paño queda menor al módulo (p. ej. muro 3000 @400 → 9 montantes, último a 180 mm).
  //
  // Regla del conteo de montantes de campo: DEPENDE DE LA INTERACCIÓN VANO/MODULACIÓN.
  // Se descarta el montante cuya línea cae dentro de un vano (lo reemplazan king+jack). Cuántas
  // líneas tapa un vano depende de su ANCHO Y de su POSICIÓN respecto de la grilla, no de una
  // fórmula floor(ancho/módulo). Por eso `nMont` sale de la geometría, no de una cuenta cerrada
  // (p. ej. una ventana de 1500 mm puede tapar 3 o 4 líneas según dónde arranque).
  const inv = xx => vanos.some(v => xx >= v.x1 - 1 && xx <= v.x2 + 1);
  const pos = []; for (let x = 0; x < larg; x += MODULO) pos.push(x);
  if (Math.abs((pos[pos.length-1] ?? -1e9) - larg) >= 1) pos.push(larg);
  pos.forEach(pp => {
    let dx = pp - cf/2; if (dx < 0) dx = 0; if (dx > larg - cf) dx = larg - cf;
    if (inv(dx + cf/2)) return;
    add("MONTANTE", hmon, [dx,0,zb], "z", MON);
  });

  // --- vanos: king / jack / dintel / cripples / solera de vano ---
  vanos.forEach(v => {
    const { x1, x2, h:hv, sill } = v;
    const xd = x1 + cf, wd = (x2 - cf) - (x1 + cf);
    add("KING", hmon, [x1,0,zb], "z", MON);
    add("KING", hmon, [x2-cf,0,zb], "z", MON);
    const hj = hv - zb;
    add("JACK", hj, [x1+cf,0,zb], "z", MON);
    add("JACK", hj, [x2-2*cf,0,zb], "z", MON);
    // Dintel: simple hasta DINTEL_SIMPLE_MAX; si el vano es más ancho, se REFUERZA doblándolo (2 pisos
    // de dintel apilados = 2 perfiles/tirantes espejados extra). Aplica a puerta/ventana/arcada por igual.
    const nply = (x2 - x1) > DINTEL_SIMPLE_MAX ? 2 : 1;
    if (wd > 10){
      for (let k = 0; k < nply; k++){
        const zk = hv + k*headH;
        if (wood){ add("DINTEL", wd, [xd,0,zk], "x", MON); add("DINTEL", wd, [xd,s.te,zk], "x", MON); }
        else { add("DINTEL", wd, [xd,0,zk], "x", MON); add("DINTEL", wd, [xd,s.a-cf,zk], "x", MON); }
      }
      if (!wood) add("SOL.DINTEL", wd, [xd,0,hv+nply*headH], "x", SOL); // PGU cap arriba del último piso
    }
    let zc = hv + nply*headH; if (!wood) zc += s.fl;   // en steel el dintel lleva un PGU encima
    const hcs = ztopC - zc;
    for (let cx = xd; cx < x2 - 2*cf; cx += MODULO){ if (hcs > 10) add("CRIPPLE", hcs, [cx,0,zc], "z", MON); }
    // Regla de la solera de vano (durmiente): SOLO en ventanas (sill > zb). Una puerta llega
    // al piso (sill = 0), así que no lleva durmiente inferior ni cripples de antepecho.
    if (sill > zb + 1){
      if (wd > 10) add("SOL.VANO", wd, [xd,0,sill], "x", SOL);
      const hci = sill - zb;
      for (let cx = xd; cx < x2 - 2*cf; cx += MODULO){
        if (hci > 10 && Math.abs(cx - (x1+cf)) > 1 && Math.abs(cx - (x2-2*cf)) > 1) add("CRIPPLE", hci, [cx,0,zb], "z", MON);
      }
    }
  });
  return P;
}
