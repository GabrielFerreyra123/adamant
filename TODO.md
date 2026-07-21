# ADAMANT — Backlog (no implementar sin instrucción explícita)

Registro de trabajo futuro. Cada tipo nuevo se agrega como un **módulo aislado** en
`src/engine/modules/` y pasa por el mismo pipeline (motor → tests → visor → wizard →
materiales/cortes/PDF → export Ruby), una fase por vez, con freno para revisión.

## Fases planificadas (spec expansión)
- **F7 — Entramado de piso (plataforma)**: vigas (joists), cenefa perimetral (rim), viga doble de
  borde, blocking a mitad de luz (>2,40 m), placa de piso (multiplacado, sólo en materiales).
  Esquema en **planta** acotado. Sin vanos en esta versión.
- **F8 — Cielorraso suspendido**: port del módulo legacy (Ruby) a la interfaz de módulos, tests
  contra las cantidades del legacy.

## F9 — Ambiente completo (combinado) · en curso
- **F9a hecho**: módulo orquestador `combinado.mjs` (piso + 4 muros, reubica piezas con `p.box`, fusiona
  materiales/cortes global). NO está registrado en `modules/index.mjs` todavía (evita un tab a medias):
  **F9c lo registra** + wizard con selector de muros en planta.
- **F9b**: visor 3D ensamblado + selector "ver por partes" (usa `p.parte`: piso/frente/fondo/izq/der) +
  vista isométrica. Export Ruby: hoy las piezas rotadas 90° llevan `p.box` pero `pos/axis` quedan sin
  transformar → el export las ubicaría mal; F9b/c debe emitir desde `box` (o transformar pos/axis).
- **F9c**: wizard (esquema en planta con Frente/Fondo/Izq/Der, tap abre editor de vanos) + PDF por etapas
  (portada iso + planta acotada + una página por etapa) usando `cortesPorEtapaVsGlobal`.
- **Cielorraso en el combinado**: agregar el cielo como opción del ambiente (fase futura, no en F9).
- **Despiece real de revestimientos**: hoy las capas (rev. exterior 12 mm / interior 12,5 mm de muros)
  son superficies VISUALES por cara (tipo REV.EXT/REV.INT, `superficie:true`, `capa`), **con los vanos
  recortados** (THREE.Shape + holes + ExtrudeGeometry desde `p.rev`), pero sin despiece, sin medidas
  comerciales ni desperdicio. No suman a materiales/cortes ni van al PDF; la visibilidad no persiste.
  Falta: elegir tipo de placa por cara, tesela por placa comercial (1,20×2,40), y computar **el recorte
  y el desperdicio por vanos** → materiales/cortes. La placa de cielorraso como capa se suma cuando el
  cielo entre al combinado.

## Backlog ordenado
1. ~~Vano de escalera/trampa en piso (vigas dobles de borde de vano + cabezales).~~ **HECHO (Fase B)**:
   `input.vano = {x, y, ancho, largo}` en coords del entramado (X = corrida, Y = luz). Enmarcado con
   trimmers (dobles, de cenefa a cenefa; si el borde cae sobre una viga de la modulación esa viga pasa
   a doble), cabezales entre caras de trimmers y vigas cola (tramo < 150 mm se descarta). Blocking
   omitido en el hueco y placa que descuenta el área. Margen mínimo de una franja de modulación:
   fuera de eso es error BLOQUEANTE (no se genera geometría). Un solo vano por piso.
   Pendiente de esta línea: múltiples vanos y dimensionado verificado de cabezales.
2. Techo: cabreadas/cerchas simples a dos aguas.
3. ~~Muro exterior portante con Cruz de San Andrés (arriostramiento).~~ **HECHO (Fase A)**: selector
   `arriostramiento` por muro (ninguno/cruz) en Muro y por lado en Ambiente (`arriostraFrente/…`,
   default `cruz`). Colocación automática: tramo lleno más ancho, subdivisión si el ángulo < 30°,
   advertencia si > 60° o si no hay tramo ≥ 400 mm. Piezas diagonales (`orient`) apoyadas sobre la
   cara exterior; el fleje va en ROLLO (fuera del bin-packing) + tensores + T1. `src/engine/brace.mjs`.
   Pendiente de esta línea: arriostramiento por placa OSB estructural (va con el despiece de revestimientos)
   y editor manual de posición de cruces.
4. Proyecto combinado: piso + 4 muros (quincho/habitación completa) reutilizando módulos.
5. Precios compartidos entre módulos (un solo listado de precios por usuario en localStorage).
6. **Cielorraso — losa de referencia en el 3D**: las velas ya se modelan (piezas VELA verticales del
   entramado hacia arriba, tipo/color propios, en leyenda/cortes/materiales). Falta dibujar la LOSA como
   plano tenue a la altura `alt + suspension` para dar contexto a las velas (hoy suben "al aire").

## Notas de arquitectura (F6)
- Interfaz de módulo: `{ id, nombre, descripcion, icono, schema, defaults(), generar(input) →
  {piezas, metadatos}, materiales(piezas, input) }`. Registro en `src/engine/modules/index.mjs`.
- El wizard se autogenera desde `schema.pasos` (campos `sistema`/`medida`/`seg`/`cards`/`perfil`);
  un módulo con sólo campos simples se agrega tocando **únicamente** `src/engine/modules/`.
- Un paso con UI a medida declara `componente: "<nombre>"` (hoy: `"vanos"`), y ese componente vive
  en el wizard. Un tipo nuevo que necesite un componente inédito sí toca el wizard.
- Visor, cortes, PDF y export Ruby consumen sólo `piezas[]` + `metadatos` (p. ej. `metadatos.esquema`
  decide frontal/planta en el PDF). Sin condicionales por tipo de módulo en el core.
- Módulo dummy de prueba: `columna` (4 parantes) — demuestra el alta por registro.
