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

// Vano de escalera/trampa. Se declara en las coordenadas DEL ENTRAMADO (las mismas que `planta`):
//   x, ancho → eje X = corrida (perpendicular a las vigas; es la luz que salvan los cabezales)
//   y, largo → eje Y = luz     (paralelo a las vigas; los cabezales cortan las vigas acá)
// El hueco LIBRE es exactamente [x, x+ancho] × [y, y+largo]: trimmers y cabezales quedan por fuera.
const VANO_MARGEN_MOD = 1;   // margen mínimo a cada borde, en franjas de modulación
const COLA_MIN = 150;        // tramo residual de viga cola sin sentido constructivo → se elimina
const CABEZAL_LUZ_AVISO = 1200; // luz de cabezal a partir de la cual se avisa

// Valida el vano contra el entramado. → { vano, errores, avisos } (vano null si no aplica o si hay error:
// nunca se genera geometría inválida).
export function validarVanoPiso(input){
  const v = input?.vano;
  const errores = [], avisos = [];
  if (!v) return { vano: null, errores, avisos };
  const L = +input.largo, W = +input.ancho, sep = +input.separacion || 400;
  const luz = Math.min(L, W), corrida = Math.max(L, W);
  const x = +v.x, y = +v.y, ancho = +v.ancho, largo = +v.largo;
  if (![x, y, ancho, largo].every(Number.isFinite) || ancho <= 0 || largo <= 0){
    errores.push("Vano inválido: revisá posición y medidas.");
    return { vano: null, errores, avisos };
  }
  const m = sep * VANO_MARGEN_MOD;
  const falta = [];
  if (x < m) falta.push("izquierda");
  if (y < m) falta.push("abajo");
  if (x + ancho > corrida - m) falta.push("derecha");
  if (y + largo > luz - m) falta.push("arriba");
  if (falta.length){
    // Mensaje en lenguaje de obra: el margen existe porque el cabezal tiene que apoyar sobre un paño
    // entero de vigas; pegado al borde no hay dónde apoyarlo.
    errores.push(`El hueco queda muy pegado al borde (${falta.join(" y ")}). Tiene que quedar a ${m} mm ` +
      `como mínimo de cada lado, que es donde apoyan los cabezales. Tocá «Acomodar» y lo ubico solo.`);
    return { vano: null, errores, avisos };
  }
  if (ancho > CABEZAL_LUZ_AVISO)
    avisos.push(`Vano ancho: verificar dimensionado de cabezales con un profesional (${ancho} mm entre trimmers).`);
  return { vano: { x, y, ancho, largo }, errores, avisos };
}

// Zona donde puede vivir el hueco (respetando el margen a los 4 bordes), en coords del entramado.
export function zonaVano(input){
  const L = +input.largo, W = +input.ancho, m = (+input.separacion || 400) * VANO_MARGEN_MOD;
  const luz = Math.min(L, W), corrida = Math.max(L, W);
  return { m, corrida, luz, maxAncho: corrida - 2*m, maxLargo: luz - 2*m };
}

// Acomoda un vano para que SIEMPRE entre: si no entra como está pero sí girado, lo gira; si aún no
// entra, lo achica; y lo corre dentro del margen. Devuelve el vano válido + qué hizo, en castellano.
// Es lo que usa la UI para que el usuario nunca quede trabado contra el error.
export function encajarVano(input, v){
  const { m, corrida, luz, maxAncho, maxLargo } = zonaVano(input);
  const ajustes = [];
  if (maxAncho < 200 || maxLargo < 200)
    return { vano: null, ajustes: [`El entramado (${corrida}×${luz} mm) es muy chico para abrir un hueco.`] };

  let ancho = Math.max(200, Math.round(+v.ancho || 0)), largo = Math.max(200, Math.round(+v.largo || 0));
  // 1) girarlo si así no entra pero girado sí (caso típico: escalera larga en el lado corto)
  if ((ancho > maxAncho || largo > maxLargo) && ancho <= maxLargo && largo <= maxAncho){
    [ancho, largo] = [largo, ancho];
    ajustes.push("Lo giré 90°: así entra en el entramado.");
  }
  // 2) achicarlo si sigue sin entrar
  if (ancho > maxAncho){ ancho = maxAncho; ajustes.push(`Achiqué el ancho a ${ancho} mm (es lo máximo que entra).`); }
  if (largo > maxLargo){ largo = maxLargo; ajustes.push(`Achiqué el largo a ${largo} mm (es lo máximo que entra).`); }
  // 3) correrlo para que respete el margen contra los bordes
  const x0 = +v.x, y0 = +v.y;
  const x = Math.min(Math.max(Number.isFinite(x0) ? x0 : m, m), corrida - m - ancho);
  const y = Math.min(Math.max(Number.isFinite(y0) ? y0 : m, m), luz - m - largo);
  if (Math.round(x) !== Math.round(x0) || Math.round(y) !== Math.round(y0))
    ajustes.push(`Lo corrí para dejar los ${m} mm de apoyo contra cada borde.`);
  return { vano: { x: Math.round(x), y: Math.round(y), ancho, largo }, ajustes };
}

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
      ], avanzado: [ { tipo: "perfil" } ] },
      { id: "vano", titulo: "Vano", componente: "vanoPiso" }
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

    // --- VANO de escalera/trampa (opcional): enmarcado con trimmers + cabezales + vigas cola ---
    const { vano: V } = validarVanoPiso(input);
    let hueco = null;                                 // { x0, x1, y0, y1 } del hueco LIBRE, ya resuelto
    if (V){
      const tol = w / 2;                              // "media ala": el borde cae sobre una viga existente
      // Trimmer izquierdo: ocupa [V.x−w, V.x] · derecho: [V.x+ancho, V.x+ancho+w]. Si el borde coincide
      // con una viga de la modulación, ESA viga pasa a doble (no se agrega otra encima).
      const encajar = xDeseado => {
        const j = jx.find(j => Math.abs(j.x - xDeseado) <= tol);
        if (j){ j.d = true; return j.x; }             // la viga existente se convierte en trimmer (doble)
        jx.push({ x: xDeseado, d: true, trimmer: true });
        return xDeseado;
      };
      const xL = encajar(V.x - w), xR = encajar(V.x + V.ancho);
      jx.sort((a, b) => a.x - b.x);
      hueco = { x0: xL + w, x1: xR, y0: V.y, y1: V.y + V.largo };
      // Las vigas que quedan ENTRE los trimmers se interrumpen: se emiten sus dos tramos (vigas cola).
      jx.forEach(j => { if (j.x > xL + 1e-6 && j.x < xR - 1e-6) j.cortada = true; });
    }

    jx.forEach(({ x, d, trimmer, cortada }) => {
      if (cortada){
        // Vigas cola: de la cenefa a la cara exterior del cabezal. Un tramo residual muy corto no tiene
        // sentido constructivo (no se puede fijar ni aporta), así que se descarta.
        [[ct, hueco.y0 - w], [hueco.y1 + w, luz - ct]].forEach(([ya, yb]) => {
          const len = Math.round(yb - ya);
          if (len >= COLA_MIN) P.push({ tipo: "VIGA_COLA", perfil: perfV, largo: len, pos: [x, ya, 0], axis: "y", mat: "viga" });
        });
        return;
      }
      const tipo = trimmer ? "TRIMMER" : d ? "VIGA_DOBLE" : "VIGA";
      P.push({ tipo, perfil: perfV, largo: luzIn, pos: [x, ct, 0], axis: "y", mat: "viga" });
    });

    // CABEZALES (headers): dobles, perpendiculares a las vigas, entre las caras interiores de los
    // trimmers. Cierran el hueco arriba y abajo y reciben las vigas cola.
    if (hueco){
      const lenCab = Math.round(hueco.x1 - hueco.x0);
      P.push({ tipo: "CABEZAL", perfil: perfV, largo: lenCab, pos: [hueco.x0, hueco.y0 - w, 0], axis: "x", mat: "viga" });
      P.push({ tipo: "CABEZAL", perfil: perfV, largo: lenCab, pos: [hueco.x0, hueco.y1, 0],     axis: "x", mat: "viga" });
    }

    // BLOCKING: piezas CORTAS independientes, una por cada bahía entre vigas contiguas (jx.length−1 por
    // fila). Fila a mitad de luz si luz > 2,40 m; cada ~2,40 m si es mayor.
    const nFilas = luz <= 2400 ? 0 : Math.ceil(luz / 2400) - 1;
    for (let r = 0; r < nFilas; r++){
      const y = Math.round(luz * (r + 1) / (nFilas + 1));
      for (let b = 0; b < jx.length - 1; b++){
        const x0 = jx[b].x + w, len = jx[b + 1].x - x0; // hueco libre entre vigas contiguas
        if (len <= 10) continue;
        // No se coloca blocking dentro del vano (ni en la franja de los cabezales).
        if (hueco && y > hueco.y0 - w && y < hueco.y1 + w && x0 < hueco.x1 && x0 + len > hueco.x0) continue;
        P.push({ tipo: "BLOCKING", perfil: perfV, largo: Math.round(len), pos: [x0, y, 0], axis: "x", mat: "blocking" });
      }
    }

    const barLen = s.wood ? (+(input.opciones?.tiraLen) || 4880) : (s.barLen || 6000); // tirantes de piso más largos en wood
    const chk = validarVanoPiso(input);
    return { piezas: P, metadatos: { nombre: "Entramado de piso", esquema: "planta", barLen, sistema: input.sistema,
      luz, corrida, planta: { x: corrida, y: luz },
      vano: hueco, errores: chk.errores, avisos: chk.avisos } };
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
    // El vano de escalera/trampa descuenta su rectángulo de la superficie de placa.
    const { vano } = validarVanoPiso(input);
    const areaVano = vano ? (vano.ancho * vano.largo) / 1e6 : 0;
    const area = Math.max(0, (L * W) / 1e6 - areaVano);                    // m²
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

    // Rigidizador de alma en cada apoyo del enmarcado del vano: 2 por cabezal (sus extremos sobre los
    // trimmers) + 1 por cada viga cola (su apoyo sobre el cabezal). 5 tornillos T1 por rigidizador.
    const nCabezales = piezas.filter(p => p.tipo === "CABEZAL").length;
    const nColas = piezas.filter(p => p.tipo === "VIGA_COLA").length;
    const rigid = nCabezales * 2 + nColas;
    let t1 = 0;
    if (rigid){
      otros.push({ key: "rigidizador", label: "Rigidizador de alma (apoyos del vano)", unidad: "u", cantidad: rigid });
      t1 = rigid * 5;
    }

    const kg = p => (p.largo / 1000) * (p.tipo === "CENEFA" ? s.kgP : s.kgM);
    const peso = piezas.reduce((a, p) => a + kg(p), 0);
    return { sistema: input.sistema, nVigas: piezas.filter(p => p.tipo === "VIGA").length, nVanos: vano ? 1 : 0,
      area: +area.toFixed(2), peso: +peso.toFixed(1), perfiles, otros, placas: [], aislacion: 0, tornillos: { t1, t2: 0 }, barLen };
  }
};
