// Color y etiqueta por tipo de pieza. Cada tipo, un color distinto (con leyenda).
export const TIPO_COLOR = {
  MONTANTE:    0x1bb6a4, // teal
  KING:        0xe85d2a, // tangerine
  JACK:        0x27b0c9, // cyan
  DINTEL:      0xb0b8bf, // gris claro
  CRIPPLE:     0x6aa0d8, // azul
  "SOL.PANEL": 0x9aa4ac, // gris solera
  "SOL.VANO":  0xe8b53a, // ámbar
  "SOL.DINTEL":0xd8c98a, // beige
  // piso
  VIGA:        0x7bbf5a, // verde
  VIGA_DOBLE:  0x4e8f3a, // verde oscuro
  CENEFA:      0x9b6dd6, // violeta
  BLOCKING:    0xd86a9e, // magenta
  // cielorraso (Montante reutiliza el teal de MONTANTE del muro)
  SOLERA:      0xe8b53a, // ámbar (solera perimetral PGU)
  MAESTRA:     0x3d9970, // verde azulado (viga maestra, nivel superior)
  VELA:        0xf2803d, // naranja (vela vertical a la losa)
  // arriostramiento
  FLEJE:       0xd9dee2, // gris chapa galvanizada (cruz de San Andrés)
  // combinado / capas de revestimiento (superficies visuales)
  PLACA:       0xc9a66b, // madera (placa de piso OSB/fenólico)
  "REV.EXT":   0x8a6d9e, // violeta apagado (revestimiento exterior — a definir)
  "REV.INT":   0x6d8a9e  // azul apagado (revestimiento interior — a definir)
};
export const TIPO_LABEL = {
  MONTANTE:"Montante", KING:"King", JACK:"Jack", DINTEL:"Dintel", CRIPPLE:"Cripple",
  "SOL.PANEL":"Solera panel", "SOL.VANO":"Solera de vano", "SOL.DINTEL":"Solera de dintel",
  VIGA:"Viga", VIGA_DOBLE:"Viga doble", CENEFA:"Cenefa", BLOCKING:"Blocking",
  SOLERA:"Solera", MONTANTE:"Montante", MAESTRA:"Viga maestra", VELA:"Vela", PLACA:"Placa de piso",
  FLEJE:"Fleje (Cruz de San Andrés)",
  "REV.EXT":"Revestimiento exterior — a definir", "REV.INT":"Revestimiento interior — a definir"
};
export const colorHex = tipo => "#" + (TIPO_COLOR[tipo] ?? 0x888888).toString(16).padStart(6, "0");
