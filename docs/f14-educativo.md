# F14 — Capa educativa (nota tras F11-bis.2, sin implementar acá)

La capa educativa **ya no se monta sobre el corte del muro** (el sándwich de capas se eliminó en
F11-bis.2: Adamant = solo estructura). La base de F14 pasa a ser la **estructura**:

## Base de la capa educativa

1. **Identificación de piezas estructurales** (ya implementado en F14): montante, solera, king, jack,
   dintel, cripple, cenefa, vela, viga maestra, cordón, diagonal, correa, cabriada, trimmer, cabezal.
   Glosario integrado (`src/content/glosario.js`) + «¿Qué es esto?» en el 3D + código en la lista de cortes.
2. **Secuencia de armado** (ya implementado, «momento maravilla»): las piezas del nivel aparecen en el
   orden real de obra (soleras → montantes → king/jack → dintel → cripples; piso, cielo y techo con su
   orden). `ARMADO` en el wizard + `Viewer.playAssembly`.

## Qué se retiró de F14 con la eliminación de capas

- El **corte esquemático del muro** como soporte educativo (era el sándwich de revestimientos).
- Los términos de revestimiento del glosario (revestimiento, membrana, barrera de vapor, rastrel).

## Pendiente para F14 (no implementar todavía)

- Reforzar la explicación de **por qué** cada pieza está donde está (carga que baja, luz que se salva),
  apoyándose en la identificación + la secuencia ya existentes, sin volver a las capas.
