// Módulo constructivo: Entramado de Piso (plataforma) — F7a (motor).
// Geometría rectangular: vigas (joists) salvando la luz menor, cenefa perimetral (rim), viga doble
// en los bordes paralelos a las vigas, y blocking a mitad de luz cuando la luz supera 2,40 m.
// Sin vanos (escalera/trampa → backlog). Ejes del motor: X = corrida (reparto de vigas),
// Y = luz (lo que salva cada viga), Z = altura (alma). El visor/planta/export se afinan en F7b/F7c.
import { resolveSystem, cutOpts } from "../systems.mjs";
import { cutList, optimizeCuts } from "../cuts.mjs";

// Luces máximas ORIENTATIVAS (verificar con profesional). C/400 mm:
//   steel PGC (0,9–1,6): 100→~2,8 m · 150→~3,8 m · 200→~4,8 m · 250→~5,8 m
//   wood 2x (Douglas):   2x6→~2,6 m · 2x8→~3,4 m · 2x10→~4,3 m · 2x12→~5,2 m
export function sugerirPerfil(luz, sistema){
  const m = luz / 1000;
  if (sistema === "wood") return m <= 2.6 ? "2x6 (38×140)" : m <= 3.4 ? "2x8 (38×184)" : "2x10 (38×235)";
  return m <= 2.8 ? "PGC 100x0.90" : m <= 3.8 ? "PGC 150x1.60" : "PGC 200x1.60";
}
const pguDe = pgc => "PGU " + pgc.split(" ")[1]; // PGC 150x1.60 → PGU 150x1.60

export const piso = {
  id: "piso",
  nombre: "Entramado de piso",
  descripcion: "Entramado de vigas para pisos y decks.",
  icono: "🪵",

  defaults(){
    return { sistema: "steel", largo: 4000, ancho: 3000, separacion: 400, apoyo: "platea", placa: true,
      opciones: { pgc: "PGC 150x1.60", pgu: "PGU 150x1.60", lumber: "2x8 (38×184)", tiraLen: 4880 } };
  },

  // schema para el wizard (F7c). Usa sólo tipos de campo ya soportados (sistema/medida/seg/perfil).
  schema: {
    pasos: [
      { id: "medidas", titulo: "Medidas", campos: [
        { k: "sistema", tipo: "sistema" },
        { k: "largo", tipo: "medida", label: "Largo", rango: [1000, 12000] },
        { k: "ancho", tipo: "medida", label: "Ancho", rango: [1000, 8000] },
        { k: "separacion", tipo: "seg", label: "Separación de vigas", opciones: [{ v: 400, l: "400 mm" }, { v: 600, l: "600 mm" }] }
      ]},
      { id: "apoyo", titulo: "Apoyo y placa", campos: [
        { k: "apoyo", tipo: "seg", label: "Apoyo", opciones: [{ v: "platea", l: "Platea" }, { v: "pilotines", l: "Pilotines / vigas" }] },
        { k: "placa", tipo: "seg", label: "Placa de piso", opciones: [{ v: true, l: "Sí" }, { v: false, l: "No" }] }
      ], avanzado: [ { tipo: "perfil" } ] }
    ]
  },

  generar(input){
    const s = resolveSystem(input);
    const L = +input.largo, W = +input.ancho, sep = +input.separacion || 400, cf = s.cf;
    const luz = Math.min(L, W), corrida = Math.max(L, W);
    const perfV = s.perfilMont, perfC = s.perfilSol;
    const P = [];

    // ct = espesor real de la cenefa/viga apoyada de canto = ala del perfil (PGU_ALA 35 steel /
    // espesor tabla wood), que es lo que dibuja el visor; NO cf (=PGC_ALA 40).
    const ct = s.wood ? s.cf : s.fl;

    // MARCO exterior: cenefa perimetral en los CUATRO lados. Encuentro de esquinas a tope: las dos
    // cenefas PERPENDICULARES a las vigas (corren en X) van de punta a punta (largo = corrida); las
    // dos PARALELAS a las vigas (corren en Y) calzan ENTRE ellas (largo = luz − 2 espesores).
    const luzIn = Math.max(luz - 2 * ct, 10);
    P.push({ tipo: "CENEFA", perfil: perfC, largo: corrida, pos: [0, 0, 0],            axis: "x", mat: "cenefa" });
    P.push({ tipo: "CENEFA", perfil: perfC, largo: corrida, pos: [0, luz - ct, 0],     axis: "x", mat: "cenefa" });
    P.push({ tipo: "CENEFA", perfil: perfC, largo: luzIn,   pos: [0, ct, 0],           axis: "y", mat: "cenefa" });
    P.push({ tipo: "CENEFA", perfil: perfC, largo: luzIn,   pos: [corrida - ct, ct, 0], axis: "y", mat: "cenefa" });

    // VIGAS (joists): corren en Y ENTRE las cenefas de extremo (a tope contra los rims → largo = luzIn,
    // arrancan en y=ct). Van todas por DENTRO del marco [ct, corrida−ct]. Los dos extremos son VIGA_DOBLE
    // apoyadas contra la cara interior de cada cenefa lateral (simétricas); el campo, modular en el medio.
    const w = cf;                                    // ancho de la viga en X = ala del perfil montante (PGC/tabla)
    const jx = [{ x: ct, d: true }];                 // doble de arranque (contra cenefa lateral izq)
    for (let x = ct + sep; x + w < corrida - ct - w; x += sep) jx.push({ x, d: false });
    jx.push({ x: corrida - ct - w, d: true });        // doble de cierre (contra cenefa lateral der)
    jx.forEach(({ x, d }) => P.push({ tipo: d ? "VIGA_DOBLE" : "VIGA", perfil: perfV, largo: luzIn, pos: [x, ct, 0], axis: "y", mat: "viga" }));

    // BLOCKING: piezas CORTAS independientes, una por cada bahía entre vigas contiguas (jx.length−1 por
    // fila). Fila a mitad de luz si luz > 2,40 m; cada ~2,40 m si es mayor.
    const nFilas = luz <= 2400 ? 0 : Math.ceil(luz / 2400) - 1;
    for (let r = 0; r < nFilas; r++){
      const y = Math.round(luz * (r + 1) / (nFilas + 1));
      for (let b = 0; b < jx.length - 1; b++){
        const len = jx[b + 1].x - (jx[b].x + w);      // hueco libre entre vigas contiguas
        if (len > 10) P.push({ tipo: "BLOCKING", perfil: perfV, largo: Math.round(len), pos: [jx[b].x + w, y, 0], axis: "x", mat: "blocking" });
      }
    }

    const barLen = s.wood ? (+(input.opciones?.tiraLen) || 4880) : (s.barLen || 6000); // tirantes de piso más largos en wood
    return { piezas: P, metadatos: { nombre: "Entramado de piso", esquema: "planta", barLen, sistema: input.sistema, luz, corrida, planta: { x: corrida, y: luz } } };
  },

  materiales(piezas, input){
    const s = resolveSystem(input), wood = s.wood;
    // tirantes de piso: 4,88 m en madera por defecto (vigas largas); PGC/PGU steel resuelve 6 m solo.
    const opts = { ...cutOpts(input), tiraLen: (+(input.opciones?.tiraLen)) || (wood ? 4880 : undefined) };
    const barLen = wood ? opts.tiraLen : 6000; // representativo (el piso usa un solo perfil)
    const { byProfile } = cutList(piezas);
    const perfiles = optimizeCuts(byProfile, opts).map(o => ({
      perfil: o.perfil, metros: +(byProfile[o.perfil].reduce((a, b) => a + b, 0) / 1000).toFixed(2),
      piezas: o.piezas, barras: o.bars, largoBarra: o.barLen, sobrantes: o.over
    }));

    const L = +input.largo, W = +input.ancho, perim = 2 * (L + W) / 1000; // m
    const area = (L * W) / 1e6;                                            // m²
    const otros = [];

    // placa de piso (multiplacado) — se cuenta acá, no se modela pieza por pieza
    if (input.placa){
      const nPlacas = Math.ceil(area / (1.22 * 2.44) * 1.10); // +10% desperdicio
      otros.push({ key: "placa-piso", label: "Placa de piso OSB/fenólico 18 mm", unidad: "placa 1,22×2,44", cantidad: nPlacas });
    }

    // solera/PGU de implantación sobre platea + fijaciones + banda estanca
    if (input.apoyo === "platea"){
      if (wood){
        otros.push({ key: "solera-asiento", label: "Solera de asiento (madera impregnada)", unidad: "m", cantidad: +perim.toFixed(2) });
      } else {
        otros.push({ key: "pgu-implantacion", label: `PGU de implantación perimetral (${pguDe(input.opciones?.pgc || "PGU 150x1.60")})`, unidad: "m", cantidad: +perim.toFixed(2) });
      }
      otros.push({ key: "anclaje-implantacion", label: "Anclaje de expansión/químico (~cada 600 mm)", unidad: "u", cantidad: Math.ceil(perim * 1000 / 600) });
      otros.push({ key: "banda-estanca", label: "Banda estanca / aislador de apoyo", unidad: "m", cantidad: +perim.toFixed(2) });
    }

    const kg = p => (p.largo / 1000) * (p.tipo === "CENEFA" ? s.kgP : s.kgM);
    const peso = piezas.reduce((a, p) => a + kg(p), 0);
    return { sistema: input.sistema, nVigas: piezas.filter(p => p.tipo === "VIGA").length, nVanos: 0,
      area: +area.toFixed(2), peso: +peso.toFixed(1), perfiles, otros, placas: [], aislacion: 0, tornillos: { t1: 0, t2: 0 }, barLen };
  }
};
