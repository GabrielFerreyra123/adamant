// Color y etiqueta por tipo de pieza. Cada tipo, un color distinto (con leyenda).
export const TIPO_COLOR = {
  MONTANTE:    0x1bb6a4, // teal
  MONTANTE_ESQUINA:  0x27d3bd, // teal claro (poste de esquina, doble del pasante)
  MONTANTE_ARRANQUE: 0x34b3e0, // celeste (arranque del muro encajado)
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
  // enmarcado del vano de escalera/trampa
  TRIMMER:     0x2f7d2f, // verde oscuro (viga doble de borde de vano)
  CABEZAL:     0xe8b53a, // ámbar (header perpendicular)
  VIGA_COLA:   0xa8d18a, // verde claro (tramo corto de viga interrumpida)
  // cielorraso (Montante reutiliza el teal de MONTANTE del muro)
  SOLERA:      0xe8b53a, // ámbar (solera perimetral PGU)
  MAESTRA:     0x3d9970, // verde azulado (viga maestra, nivel superior)
  VELA:        0xf2803d, // naranja (vela vertical a la losa)
  // techo (cabriadas)
  CORDON_SUPERIOR: 0xe07a3f, CORDON_INFERIOR: 0xc4622c, DIAGONAL: 0x6aa0d8,
  MONTANTE_CABRIADA: 0x1bb6a4, MONTANTE_TIMPANO: 0x3d9970, CORREA: 0x9b6dd6, CUBIERTA: 0x8fa3ad,
  // arriostramiento
  FLEJE:       0xd9dee2, // gris chapa galvanizada (cruz de San Andrés)
  FLEJE_CIELO: 0xb6c2c9, // gris más oscuro (arriostre del ala inferior del cordón)
  // apoyos / fundación (superficies visuales de hormigón)
  PLATEA:         0x8a9299, // gris hormigón
  PILOTIN:        0x7d858c, // gris hormigón (algo más oscuro)
  SOLERA_ASIENTO: 0x9aa2a8, // gris claro (viga de asiento sobre pilotines)
  // placa de piso (diafragma estructural) — superficie visual conmutable
  PLACA:       0xc9a66b
};
export const TIPO_LABEL = {
  MONTANTE:"Montante", MONTANTE_ESQUINA:"Montante de esquina", MONTANTE_ARRANQUE:"Montante de arranque",
  KING:"King", JACK:"Jack", DINTEL:"Dintel", CRIPPLE:"Cripple",
  "SOL.PANEL":"Solera panel", "SOL.VANO":"Solera de vano", "SOL.DINTEL":"Solera de dintel",
  VIGA:"Viga", VIGA_DOBLE:"Viga doble", CENEFA:"Cenefa", BLOCKING:"Blocking",
  TRIMMER:"Trimmer (borde de vano)", CABEZAL:"Cabezal", VIGA_COLA:"Viga cola",
  SOLERA:"Solera", MONTANTE:"Montante", MAESTRA:"Viga maestra", VELA:"Vela", PLACA:"Placa de piso (diafragma)",
  PLATEA:"Platea de hormigón", PILOTIN:"Pilotín de hormigón", SOLERA_ASIENTO:"Solera de asiento",
  FLEJE:"Fleje (Cruz de San Andrés)", FLEJE_CIELO:"Fleje arriostre de cielo",
  CORDON_SUPERIOR:"Cordón superior", CORDON_INFERIOR:"Cordón inferior", DIAGONAL:"Diagonal (Fink)",
  MONTANTE_CABRIADA:"Montante de cabriada", MONTANTE_TIMPANO:"Montante de tímpano", CORREA:"Correa", CUBIERTA:"Chapa de cubierta"
};
export const colorHex = tipo => "#" + (TIPO_COLOR[tipo] ?? 0x888888).toString(16).padStart(6, "0");
