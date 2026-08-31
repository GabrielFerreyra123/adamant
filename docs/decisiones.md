# Registro de decisiones · Adamant

Cada decisión de diseño que no se lee en el código va acá, en el momento en que se toma.
Formato fijo, tres partes:

- **Qué decidí** — en una oración.
- **Por qué** — la razón, no la justificación.
- **Costo si me equivoco** — estimado *antes* de saber el resultado.

Escribir el costo antes obliga a estimar. Cuando dos semanas después aparece la consecuencia,
queda escrito si se había previsto o no: así se aprende a estimar mejor en vez de racionalizar.

Nunca se borra una entrada. Si una decisión se revierte, se anota la nueva debajo diciendo cuál
reemplaza y qué se aprendió.

---

## D3 — Dossier de cumplimiento (entregable premium para el profesional)

**Estado:** hecho (2026-08-11). Construido con el método completo (brainstorming → diseño en chat →
TDD → verify).

**Qué decidí, y por qué:**
- **PDF separado**, no anexo del PDF de obra. El PDF de obra es para el taller (cortes, medidas); el
  dossier es para el profesional que revisa y firma. Mezclarlos confunde los dos públicos.
- **Lleva bloque de firma/matrícula.** Es el sentido del entregable: que el profesional lo complete y
  firme. (Ojo: distinto del bug de Noxis de la "hoja en blanco con firma" — acá el renglón es intencional.)
- **El clima viaja por `opts.clima`**, no por el input del motor. Los datos del semáforo
  (`ciudad/zonaViento/nieve/zonaBio`) viven en el estado de la UI; el generador server-side los recibe
  aparte, igual que el PDF recibe `img`/`precios`. Sin clima → defaults neutros.
- **Sin logo, sin formato configurable, sin toggles por norma** (YAGNI).

**Defecto cazado leyendo el papel** (para lo que existe la puerta del entregable): el carácter `≤` de
los rangos del semáforo no está en la fuente estándar de jsPDF y rompía la línea con letter-spacing
(`p o r t a n t e   t í p i c o`). Se sanea a `<=`/`>=` en `dossier.mjs` (`safe()`), con test que lo
guarda (`test/dossier.test.mjs`: el rango "2,80 m" tiene que quedar contiguo). Ningún test unitario del
motor lo veía; salió de *mirar* el PDF.

**Costo si me equivoco:** un entregable más para mantener. Contra que el profesional reciba un papel con
los rangos ilegibles, o que Adamant no tenga nada que darle al que firma.

**Revisión (revisor sin contexto):** ratificó 3 hallazgos, los tres corregidos — (1/2) las notas de
corte del PDF de obra podían caer fuera de hoja o pisar el footer en listas largas → guard de página en
`drawCortesNotas`; (3) las medidas del dossier salían con punto en vez de coma es-AR → `m2()` con coma
(guardado por test).

---

## D2 — Una puerta de verificación que mira el ENTREGABLE (adopción del método Noxis)

**Estado:** adoptada (2026-08-11).

**Qué decidí:** sumar `npm run entregable` (`scripts/entregable.mjs`) como tercera puerta, y `npm run
verify` que encadena las tres con `&&` (test + build + entregable). La puerta genera el PDF de obra de
tres proyectos de muestra a `./.entregable/`, imprime los números para leerlos, y **falla en rojo** si:
ninguna pieza cortable desaparece entre geometría y plan de corte (regla 5), el PDF dice lo que la
pantalla dice (regla 2, `over`→empalme, sin inventarlo cuando no hay), y no estima en silencio (regla 3,
merma de sierra y precios de referencia).

**Por qué:** de D0/Noxis, lo que Adamant no tenía. Sus dos puertas (`npm test`, `npm run build`) miran
el código; ninguna miraba el papel que va a la obra. El patrón de los defectos caros no es de lógica: es
un desacuerdo entre dos lugares (la geometría y el PDF), y eso un test unitario no lo ve. D1 fue de esa
familia; esta puerta la habría cazado sola.

**Qué NO adopté (proporcionalidad — Noxis §8):** el bucle de cuatro roles con subagentes, y las 350
pruebas / 7 puertas. Noxis emite un documento legal firmado por un matriculado; Adamant es estimación de
costos: un número mal se corrige y se sigue. Lo que Adamant ya tenía de Noxis: CLAUDE.md con
prohibiciones (5 reglas), este ledger con costo-si-me-equivoco, y el TDD "test que falla primero".

**Verificación (método):** muté el aviso de `over` en `pdf.mjs` (`if (false && totalOver)`) y confirmé
que la puerta sale con **exit 1** y nombra el defecto; restaurada. La puerta bloquea de verdad, no se
saltea en silencio.

**Costo si me equivoco:** un comando más que correr y ~3 PDFs de muestra en un dir ignorado. Contra
volver a mandar a obra un papel al que le falta un aviso que sí está en pantalla.

---

## D1 — Las piezas que no entran en la barra desaparecen del PDF de obra

**Estado:** CERRADA (2026-08-11). El conteo `over` y la merma de sierra ahora se leen en el PDF.

**Cómo se cerró:** `src/export/pdf.mjs` suma `drawCortesNotas(doc, plan, y)`, llamada por los dos
renderers de la lista de corte (el inline de módulo simple y `drawCortesTabla` del ambiente). Junto a
la tabla imprime, cuando `over > 0`, *"N pieza(s) más largas que la barra comercial - requieren
empalme"* con el detalle por perfil, y siempre la nota de que el corte **no descuenta la merma de
sierra** (regla 3). Verificado leyendo el PDF generado, no sólo el dibujo: para un muro de 8 m el papel
dice *"2 pieza(s)… empalme · PGU 100x0.90: 2 pieza(s) (barra de 6,00 m)"*, que coincide con `over=2` de
la geometría. Test: `test/pdf.test.mjs` extrae el texto del binario y cae si el aviso falta (incluye un
control negativo: sin piezas largas, el aviso NO aparece).

**No aplica CSV:** la app real (`src/`) no exporta CSV; los entregables son PDF/DXF/OBJ. El `exportCSV`
que menciona la regla 5 vive sólo en el monolito legacy (`adamant-generador-scripts.html`, no se edita).

**Verificación del pendiente:** los precios de referencia **ya se decían** en el PDF
(`drawCompra`: *"precios de referencia de mercado… Verificá con tu corralón"*); la merma de sierra
**faltaba** y se agregó con este cambio.

**Antes (queda como registro):** abierta. Defecto encontrado, sin arreglar.

`optimizeCuts` y `cutPlan` (`src/engine/cuts.mjs`) filtran los largos mayores a la barra
comercial y los cuentan en `over`. La pantalla lo avisa —`src/ui/wizard.js:1492`,
*"N pieza(s) más largas que la barra — requieren empalme"*— pero en `src/export/pdf.mjs` no
aparece ni `over` ni la palabra empalme.

El PDF es el papel que va al taller. La pantalla no viaja. Alguien compra y corta con el PDF
sin enterarse de que hay piezas que necesitan empalme.

**Decisión:** el conteo de `over` va al PDF de obra y al CSV, no sólo a la pantalla. De acá sale
la regla 2 de `CLAUDE.md`, y también la 5.

**Costo si me equivoco:** una línea de más en el PDF cuando no hay piezas largas. Contra que
alguien corte una obra entera sin saber que dos vigas no salen de una barra.

**Pendiente de verificar** (no lo miré todavía): si la merma de sierra y el hecho de que los
precios son de referencia están dichos en el PDF, o sólo en `CLAUDE.md`. Es la regla 3.

---

## D0 — Por qué existe este archivo

Viene del método con el que se construyó Noxis (el generador de protocolos de iluminación).
Lo que se importa acá, en orden de lo que rindió allá:

1. Un `CLAUDE.md` con **prohibiciones**, no con descripción de arquitectura. La arquitectura la
   cuenta el código; lo que el código no cuenta es qué está prohibido.
2. Este registro de decisiones con costo-si-me-equivoco.
3. Que el revisor de un cambio sea alguien sin el contexto del que lo implementó.
4. Una puerta de verificación construida a medida del riesgo real del proyecto: un comando que
   **falla**, no un checklist.
5. Verificación por mutación en los dos o tres tests que más importan: romper la implementación
   a propósito y confirmar que el test cae. Si sigue verde, el test no prueba lo que dice.
6. Un paso de "mirar el resultado" que exija **leer los números**. En Noxis, una escala impresa
   cien veces menor de lo que era pasó por un paso de "lo miré y está bien".

**El patrón de los defectos que ese método encontró:** ninguno era un error de lógica. Todos
eran *desacuerdos entre dos lugares* — un número y su unidad, un texto y su código, un aviso y
su documento. Los tests unitarios verifican un lugar a la vez. D1 es de esa familia.

**Lo que Adamant ya tiene y no hay que rehacer:** 191 tests en verde, build limpio, el motor
puro separado del DOM, y la regla de que el cómputo se deriva de la geometría escrita como
comentario en `cuts.mjs` (ahora promovida a regla 1).

**Lo que le falta:** puertas de verificación. Hoy hay dos (`npm test`, `npm run build`) y
ninguna mira el entregable. Los tres outputs que más duelen si salen mal son la lista de corte,
el cómputo/presupuesto y el script de SketchUp. Ninguno tiene hoy un comando que lo abra.
