// Módulo constructivo: Cielorraso suspendido — F8 (motor).
// Grilla de perfiles PGO (Omega) colgados: portantes en la dirección del lado más largo,
// travesaños perpendiculares cada ~1200 mm. Solo steel/aluminio (sin variante wood).
// Ejes del motor: X = dirección de los portantes, Y = dirección de los travesaños, Z = 0 (planta).
import { PGO } from "../systems.mjs";
import { cutList, optimizeCuts } from "../cuts.mjs";

const PERFIL = "PGO Omega";
const SEP_TRAV = 1200; // separación de travesaños (fija)

export const cielorraso = {
  id: "cielorraso",
  nombre: "Cielorraso suspendido",
  descripcion: "Grilla de perfiles Omega con placas de yeso o PVC.",
  icono: "🔲",

  defaults(){
    return { sistema: "steel", largo: 4000, ancho: 3000, separacion: 400,
      opciones: { placa: "PVC (aprox)" } };
  },

  schema: {
    pasos: [
      { id: "medidas", titulo: "Medidas", campos: [
        { k: "largo", tipo: "medida", label: "Largo", rango: [1000, 12000] },
        { k: "ancho", tipo: "medida", label: "Ancho", rango: [1000, 8000] },
        { k: "separacion", tipo: "seg", label: "Separación de portantes", opciones: [{ v: 400, l: "400 mm" }, { v: 600, l: "600 mm" }] }
      ]},
      { id: "placa", titulo: "Placa", campos: [
        { k: "placa", opt: true, tipo: "seg", label: "Tipo de placa",
          opciones: [
            { v: "PVC (aprox)", l: "PVC" },
            { v: "Durlock 9.5", l: "Yeso 9,5 mm" },
            { v: "Durlock 12.5", l: "Yeso 12,5 mm" },
            { v: "Ninguno", l: "Ninguno" }
          ] }
      ] }
    ]
  },

  generar(input){
    const L = +input.largo, W = +input.ancho, sep = +input.separacion || 400;
    // Portantes corren en la dirección del lado más largo; travesaños perpendiculares.
    const corrida = Math.max(L, W), luz = Math.min(L, W);
    const ct = PGO.b; // espesor del perfil PGO (22 mm, equivalente al "ala" para posicionamiento)
    const P = [];

    // PORTANTES: corren en X (dirección de la corrida), separados cada `sep` en Y.
    // Incluye un portante en Y=0 y otro en Y=luz-ct (extremos), más los intermedios.
    const portY = [0];
    for (let y = sep; y + ct < luz; y += sep) portY.push(y);
    if (portY[portY.length - 1] < luz - ct - 1) portY.push(luz - ct);

    portY.forEach(y =>
      P.push({ tipo: "PORTANTE", perfil: PERFIL, largo: corrida, pos: [0, y, 0], axis: "x", mat: "portante" })
    );

    // TRAVESAÑOS: perpendiculares a los portantes (corren en Y), cada ~1200 mm en X.
    // Son segmentos CORTOS entre portantes contiguos (uno por bahía, como blocking del piso).
    const nFilas = Math.max(0, Math.ceil(corrida / SEP_TRAV) - 1);
    for (let r = 0; r < nFilas; r++){
      const x = Math.round(corrida * (r + 1) / (nFilas + 1));
      for (let b = 0; b < portY.length - 1; b++){
        const len = portY[b + 1] - (portY[b] + ct); // hueco libre entre portantes contiguos
        if (len > 10) P.push({ tipo: "TRAVESANO", perfil: PERFIL, largo: Math.round(len), pos: [x, portY[b] + ct, 0], axis: "y", mat: "travesano" });
      }
    }

    const barLen = 6000; // PGO comercial: 6 m
    return { piezas: P, metadatos: { nombre: "Cielorraso suspendido", esquema: "planta", barLen, sistema: "steel", corrida, luz } };
  },

  materiales(piezas, input){
    const L = +input.largo, W = +input.ancho;
    const barLen = 6000;
    const { byProfile } = cutList(piezas);
    const perfiles = optimizeCuts(byProfile, barLen).map(o => ({
      perfil: o.perfil, metros: +(byProfile[o.perfil].reduce((a, b) => a + b, 0) / 1000).toFixed(2),
      piezas: o.piezas, barras: o.bars, largoBarra: barLen, sobrantes: o.over
    }));

    const area = (L * W) / 1e6; // m²
    const otros = [];

    // Colgantes: ~1 cada 1000 mm por portante
    const nPort = piezas.filter(p => p.tipo === "PORTANTE").length;
    const corrida = Math.max(L, W);
    const colgPorPort = Math.max(2, Math.ceil(corrida / 1000));
    otros.push({ key: "colgante", label: "Colgante / varilla roscada", unidad: "u", cantidad: nPort * colgPorPort });

    // Placas
    const placa = input.opciones?.placa || "Ninguno";
    if (placa && placa !== "Ninguno"){
      const esPVC = placa.includes("PVC");
      const areaPlaca = esPVC ? (0.20 * 6) : (1.20 * 2.40); // PVC: tira 200 mm × 6 m = 1.2 m²; yeso: 2.88 m²
      const nPlacas = Math.ceil(area / areaPlaca * 1.10); // +10% desperdicio
      const unidad = esPVC ? "tira 200×6000 mm" : "placa 1,20×2,40";
      otros.push({ key: "placa-cielo", label: `Placa ${placa}`, unidad, cantidad: nPlacas });
    }

    // Tornillos de fijación (estimación)
    const t1 = nPort * 2 + piezas.filter(p => p.tipo === "TRAVESANO").length * 2;
    const m2placa = (placa && placa !== "Ninguno") ? area : 0;
    const t2 = Math.round(m2placa * 10); // ~10 tornillos/m² placa de cielo

    const peso = piezas.reduce((a, p) => a + (p.largo / 1000) * PGO.kg, 0);

    return { sistema: "steel", nVigas: nPort, nVanos: 0,
      area: +area.toFixed(2), peso: +peso.toFixed(1), perfiles, otros,
      placas: [], aislacion: 0, tornillos: { t1, t2 }, barLen };
  }
};
