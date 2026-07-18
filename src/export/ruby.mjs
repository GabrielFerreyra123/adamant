// ADAMANT · export a SketchUp (.rb). Reutiliza el generador legacy: el HELPER (`_profile` + MAP_*)
// es el mismo del app original; se emite una llamada `_profile` por pieza del motor, con la sección
// y el mapper que corresponden a su tipo (idéntica maquinaria que scriptMuro/_wall).
import { resolveSystem } from "../engine/systems.mjs";
import { getModule } from "../engine/modules/index.mjs";

// HELPER legacy verbatim (el bloque ETIQUETAS queda inerte: ETIQUETAS no está definido).
const HELPER = `def _profile(parent, pts2d, mapper, dist, axis, origin, mat, tag, xf=nil)
  g = parent.add_group
  f = g.entities.add_face(pts2d.map { |u, v| mapper.call(u, v) })
  f.pushpull(dist.mm)
  b = g.bounds
  mn = axis == :x ? b.min.x : (axis == :y ? b.min.y : b.min.z)
  if mn < -0.01
    v = axis == :x ? [dist.mm,0,0] : (axis == :y ? [0,dist.mm,0] : [0,0,dist.mm])
    g.transform!(Geom::Transformation.new(v))
  end
  g.transform!(Geom::Transformation.new([origin[0].mm, origin[1].mm, origin[2].mm]))
  g.transform!(xf) if xf
  g.material = mat; g.layer = tag
  g
end
MAP_YZ = ->(y,z){ Geom::Point3d.new(0, y.mm, z.mm) }
MAP_XZ = ->(x,z){ Geom::Point3d.new(x.mm, 0, z.mm) }
MAP_XY = ->(x,y){ Geom::Point3d.new(x.mm, y.mm, 0) }`;

const rbSec = sec => "[" + sec.map(p => `[${p[0]},${p[1]}]`).join(",") + "]";
const num = v => Number.isInteger(v) ? v : +(+v).toFixed(2);

export function exportRuby(input){
  const s = resolveSystem(input), wood = s.wood;
  const gen = getModule(input.kind).generar(input);
  const metadatos = gen.metadatos;
  // Los revestimientos son capas VISUALES "a definir" → no se exportan a SketchUp (la placa de piso sí).
  const piezas = gen.piezas.filter(p => p.capa !== "rev-ext" && p.capa !== "rev-int");
  const LARGO = Math.round(+input.largo || Math.max(1, ...piezas.map(p => p.pos[0] + p.largo)));
  const ALTURA = Math.round(+input.alto || 1);

  // --- secciones (idénticas a scriptMuro/_wall) ---
  let secDecl;
  if (wood){
    const WE = s.te, WA = s.a;
    secDecl = `PLATE=${rbSec([[0,0],[WA,0],[WA,WE],[0,WE]])}\nSTUD=${rbSec([[0,0],[WE,0],[WE,WA],[0,WA]])}`;
  } else {
    const a = s.a, fl = s.fl, t = s.t, ca = s.ca, cf = s.cf, cl = s.cl, ct = s.ct;
    const U_BOT = [[0,fl],[0,0],[a,0],[a,fl],[a-t,fl],[a-t,t],[t,t],[t,fl]];
    const U_TOP = [[0,0],[0,fl],[a,fl],[a,0],[a-t,0],[a-t,fl-t],[t,fl-t],[t,0]];
    const C = [[cf,cl],[cf,0],[0,0],[0,ca],[cf,ca],[cf,ca-cl],[cf-ct,ca-cl],[cf-ct,ca-ct],[ct,ca-ct],[ct,ct],[cf-ct,ct],[cf-ct,cl]];
    secDecl = `U_BOT=${rbSec(U_BOT)}\nU_TOP=${rbSec(U_TOP)}\nC=${rbSec(C)}`;
  }

  // solera-like = perfil U (soleras del muro + cenefa del piso + solera del cielo); el resto = perfil C/STUD.
  // "SOLERA" ya entra por el prefijo "SOL".
  const soleraLike = t => t.startsWith("SOL") || t === "CENEFA";
  const MAT = {
    "SOL.PANEL":"Silver", "SOL.VANO":"Silver", "SOL.DINTEL":"Silver", CENEFA:"MediumPurple", SOLERA:"Goldenrod",
    MONTANTE: wood ? "SaddleBrown" : "SteelBlue", KING:"Orange", JACK:"Cyan", DINTEL:"Gray", CRIPPLE:"SteelBlue",
    VIGA:"ForestGreen", VIGA_DOBLE:"DarkGreen", BLOCKING:"HotPink",
    MAESTRA:"SeaGreen", VELA:"OrangeRed"
  };
  const sub = t => soleraLike(t) ? "t_sol" : (t === "KING" || t === "JACK" || t === "DINTEL" || t === "CRIPPLE") ? "t_van" : "t_mon";
  const secOf = p => soleraLike(p.tipo)
    ? (wood ? "PLATE" : (ALTURA && p.pos[2] > ALTURA * 0.5 ? "U_TOP" : "U_BOT"))
    : (wood ? "STUD" : "C");

  // Transform de reubicación (módulo combinado): la pieza se dibuja en su forma canónica (origin = pos
  // local) y `xf` la lleva a su lugar en el ambiente — el MISMO rot/traslación que usa el visor (p.box),
  // así el script reproduce el ensamble. rot 90° = ROTZ90; la traslación va en mm.
  let usaXf = false;
  const xfDe = p => {
    const t = p.xf; if (!t) return "";
    const ident = !t.rot && !t.tx && !t.ty && !t.tz; if (ident) return "";
    usaXf = true;
    const tr = `Geom::Transformation.new([${num(t.tx)}.mm, ${num(t.ty)}.mm, ${num(t.tz)}.mm])`;
    return ", " + (t.rot === 90 ? `${tr} * ROTZ90` : tr);
  };
  const calls = piezas.map(p => {
    // PLACA de piso: superficie plana (rectángulo largo×ancho + pushpull del espesor), no un perfil.
    if (p.tipo === "PLACA"){
      const [sx, sy, sz] = p.box.size, [cx, cy, cz] = p.box.center;
      const rect = `[[0,0],[${num(sx)},0],[${num(sx)},${num(sy)}],[0,${num(sy)}]]`;
      return `_profile(we, ${rect}, MAP_XY, ${num(sz)}, :z, [${num(cx-sx/2)},${num(cy-sy/2)},${num(cz-sz/2)}], "BurlyWood", t_sol)`;
    }
    const mapper = p.axis === "z" ? "MAP_XY" : p.axis === "y" ? "MAP_XZ" : "MAP_YZ";
    const axis = p.axis === "z" ? ":z" : p.axis === "y" ? ":y" : ":x";
    const org = `[${p.pos.map(num).join(",")}]`;
    return `_profile(we, ${secOf(p)}, ${mapper}, ${num(p.largo)}, ${axis}, ${org}, "${MAT[p.tipo]||"Silver"}", ${sub(p.tipo)}${xfDe(p)})`;
  }).join("\n");
  const rotzDecl = usaXf ? "\nROTZ90 = Geom::Transformation.rotation(ORIGIN, Z_AXIS, 90.degrees)" : "";

  const nombre = `${metadatos.nombre} ${wood ? "wood" : "steel"}`;
  return `# ADAMANT · ${nombre} (export desde el motor) | unidades en mm
LARGO=${LARGO}; ALTURA=${ALTURA}
${HELPER}${rotzDecl}
model=Sketchup.active_model; model.start_operation("Muro",true); root=model.active_entities
t_sol=model.layers.add("Estructura-Soleras"); t_mon=model.layers.add("Estructura-Montantes"); t_van=model.layers.add("Estructura-Vanos")
wall=root.add_group; wall.name="Muro #{LARGO.to_i}x#{ALTURA.to_i}"; we=wall.entities
${secDecl}
${calls}
wall.explode
model.commit_operation; model.active_view.zoom_extents
puts "Muro OK: ${piezas.length} piezas. Perfiles sueltos, cada uno editable."`;
}
