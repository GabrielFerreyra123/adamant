# Adamant · Generador de scripts Steel/Wood Frame

App HTML de una sola página que **genera scripts Ruby** para pegar en la Consola Ruby de
SketchUp 2026 (Extensions → Developer → Ruby Console). Al correr el script, dibuja la
estructura (steel frame o wood frame) dentro de SketchUp y calcula el cómputo de materiales.
Objetivo: modelar muros, cielorrasos y casas completas + su presupuesto sin saber usar SketchUp.

Todo el código vive en un único archivo: **`adamant-generador-scripts.html`** (HTML + CSS + JS
embebidos). No hay build ni dependencias; se abre directo en el navegador.

Contexto del usuario (Gaby): negocio de construcción Adamant (steel frame + perfilería de
aluminio con PVC para cielorrasos). Tiene SketchUp 2026 + V-Ray de escritorio.

---

## Cómo trabajar (preferencias — respetar siempre)

- Respuestas concisas, sin preámbulos ni resúmenes largos, sin adulación ("excelente", "perfecto").
- Soluciones mínimas, sin abstracciones prematuras. No narrar planes antes de ejecutar.
- **Edición puntual** sobre lo existente (str_replace / ediciones chicas). No reescribir de más
  ni duplicar código ya editado.
- **Validar antes de decir "listo"** (ver sección Validación).
- Si hay una objeción, decirla en 1 oración y proceder.
- El HTML es un archivo grande: al editar, buscar el bloque exacto y reemplazar sólo eso.

## Marca (usar en todo lo visual)

- Paleta: Ocean Obsidian `#0A1A22` (fondo), Teal Tide `#1BB6A4`, Tangerine Tango `#E85D2A`.
- Tipografías: Space Grotesk (texto), Barlow Condensed (títulos), JetBrains Mono (código).
- Variables CSS ya definidas en el `<style>`: `--teal`, `--tangerine`, `--panel`, `--line`, `--muted`, etc.

---

## Validación (obligatoria antes de "listo")

```bash
npm run validate      # 1) extrae el <script>, node --check (sintaxis JS)
                      # 2) evalúa los generadores y produce .rb de muestra
                      # 3) si hay ruby instalado: ruby -c + ejecución contra el stub de SketchUp
```

- `tools/su_stub.rb` es un **stub mínimo de la API de SketchUp** (Geom, Entities, Group,
  Transformation.axes/scaling/rotation, materials, add_text…). Permite ejecutar el Ruby generado
  fuera de SketchUp y contar piezas / detectar errores de runtime.
- `tools/validate.js` hace todo el pipeline. `npm run gen` sólo regenera los `.rb` de muestra en `tools/out/`.
- Regla: **cualquier cambio al JS que genera Ruby se valida generando el Ruby y corriéndolo contra el stub**
  (steel y wood, y para Casa los 4 tipos de techo). Si `ruby` no está instalado, al menos `node --check`.

---

## Flujo de uso en SketchUp

1. Unidades en **milímetros** (Window → Model Info → Units).
2. Extensions → Developer → Ruby Console.
3. Copiar el código de la app, pegar en la barra inferior → Enter.
4. Aparece la estructura; cada perfil es un grupo en su capa/tag. Al final se hace `.explode`
   del contenedor para que las piezas queden sueltas y editables (salvo con etiquetado activo,
   que las deja como grupos nombrados).

---

## Arquitectura del Ruby generado

**Helper central** (constante `HELPER`, compartido por todos los módulos):

```ruby
_profile(parent, pts2d, mapper, dist, axis, origin, mat, tag, xf=nil)
```
Crea un grupo, `add_face` de la sección 2D, `pushpull(dist.mm)`, corrige la dirección si el
`bounds.min` del eje quedó negativo, traslada a `origin` (mm) y luego aplica la transformación
opcional `xf` (para rotar/ubicar el muro en planta). Si `ETIQUETAS` está activo, nombra la pieza
(M-01, K-01…) y agrega texto 3D.

**Mappers** (cómo se extruye la sección 2D):
- `MAP_YZ` → sección en Y-Z, extruye en X.
- `MAP_XZ` → sección en X-Z, extruye en Y.
- `MAP_XY` → sección en X-Y, extruye en Z (montantes/studs verticales).

**Helpers adicionales** (definidos en el script de Casa):
- `_T(x,y,z)` → traslación en mm. `ROTZ90` → rotación 90° en Z (para muros que corren en Y).
- `_beam3d(we, p0, p1, sec, mat, tag)` → perfil recto entre dos puntos 3D (cordones inclinados,
  limatesas, vigas, correas). Alinea el eje X local del perfil con el vector p0→p1 vía
  `Geom::Transformation.axes`.
- `_csec` / `_usec` → sección C/U (steel) **o rectángulo sólido** (wood) según `SIS`.
- `_wall(we, larg, xf, vanos)` → un muro completo corriendo en X local; `xf` lo ubica en planta.
  Dibuja soleras (simple steel / **doble en madera** = double top plate), montantes en la
  modulación (salteando vanos) y por cada vano: King, Jack, Dintel, Cripples, solera/durmiente de vano.
- `_corner(we, x, y, sx, sy)` → poste de esquina multi-montante (L de 2 piezas), `sx/sy` = cuadrante interior.
- `_brace(we, larg, xf, vanos)` → Cruz de San Andrés (fleje 30×0.5) en paños sin vano.
- `_plate(we, larg, xf, lado, esp, mat, vanos)` → revestimiento (`:ext`/`:int`) **teselado en cortes que
  descuentan los vanos** (paños entre aberturas + placa sobre dintel + placa bajo antepecho); con
  fijaciones activas siembra tornillos de placa en el perímetro y sobre las líneas de montante.

**Convenciones de coordenadas**
- Muro canónico: corre en X∈[0,larg], espesor en Y∈[0,a] (a = alma PGU steel / ancho de la pieza wood),
  altura en Z∈[0,ALTURA]. Se dibuja siempre así y `xf` lo lleva a su posición/orientación real.
- Muros que corren en Y (laterales): `xf = _T(...)*ROTZ90`.
- Steel: el PGC **encastra dentro** del PGU → `hmon = ALTURA − 2·PGU_ESP`, montante desde `z=PGU_ESP`.
- Wood: studs **entre** plates → `hmon = ALTURA − 3·WOOD_ESP` (solera inferior + double top plate),
  montante desde `z=WOOD_ESP`.

**Capas (tags)**: `Estructura-Soleras`, `Estructura-Montantes`, `Estructura-Vanos`,
`Estructura-Techo`, `Estructura-Entrepiso`, `Estructura-Arriostres`, `Revestimientos`, `Hormigon`,
`Herrajes` (anclajes/hold-downs), `Fijaciones` (marcadores de tornillo).

**Fijaciones/herrajes** (helpers en el script de Casa, prismas `add_face`+`pushpull`, gate global `HERRAJES`):
`_hw` (prisma sólido sin rotular), `_oct(r)` (sección octogonal), `_screw(we,x,z,xf)` (marcador de unión
atornillada sobre la cara del muro, coords locales + xf), `_anchor(we,x,y)` (bulón J embebido en la platea,
con arandela+tuerca **apoyadas sobre la cara sup de la solera** en z=`zb`, coords absolutas de planta),
`_holddown(we,x,y)` (**fleje STHD14**: strap embebido en hormigón z=−260…560 + clavos que lo fijan al montante
de esquina), `_pscrew(we,x,z,xf,y)` (tornillo de placa sobre la cara expuesta del revestimiento). `_wall`
marca **todas** las uniones perfil-perfil (montantes, jacks, cripples sup/inf, kings, apoyo de dintel);
`_corner` y `_brace` marcan sus extremos; `_plate` siembra el perímetro + líneas de montante; `scriptCasa`
emite anclajes (~cada 1200 mm, **salteando umbrales de puerta** donde la solera está cortada) y STHD14 en esquinas.
Con fijaciones activas el modelo suma muchos marcadores (pesado pero manejable; se baja con el checkbox).

---

## Generadores JS (dónde tocar)

Todo dentro del `<script>` del HTML.

**Tablas de datos**: `PGC`, `PGU` (perfiles IRAM Barbieri, kg/m), `REVEST` (kg/m² revestimientos),
`LUMBER` (escuadrías 2x, mm reales), `WOOD_DENS`, `PGO_KG`. Helpers `lumberKg()`, `wallThk(p)`.

**Módulos**:
- `scriptMuro(p)` — Muro/Tabique. Sensible al sistema (steel C/U simple · wood sólido + double top).
- `scriptCielo(p)` — Cielorraso suspendido (sólo steel/aluminio; es la línea PVC de Gaby).
- `scriptCasa(p)` — Casa completa. Es el módulo grande.
- `scriptMueble(c)` — **Estructura de perfilería (free-form)**. El modelo es una **lista libre de perfiles**
  `c.profiles=[{t:'m'|'s', a:[x,y,z], b:[x,y,z]}]` (montante gris / solera naranja) dibujados en el lienzo 3D;
  `scriptMueble` emite **solo** `_beam(we,p0,p1,sec,mat,lay)` por cada perfil (sección `MC` montante / `SU` solera).
  `computeMueble` es puramente por perfiles (metros montante/solera, peso, uniones→T1). Ya **no** hay modelo por
  columnas/estantes/placa como driver (el editor 2D de frente y `_post`/`_shelf`/`_partition`/`_anc`/`_txt` quedan
  como helpers heredados en el template pero no se llaman). `seedRopero()` convierte un ropero paramétrico
  (`muebleSegs`) en perfiles editables (botón "Base ropero" / import IA). **Legacy (referencia, ya no driver):**
  Perfilería Durlock (Montante/Solera **35 o 70**) + placa
  (yeso/OSB/PVC/cementicia, o "Ninguno" = solo estructura galvanizada). Modelo por **columnas**: cada
  columna tiene `estantes:[z]` y `barrales:[z]`. **Montantes** (gris, "Gray") verticales frente+fondo por
  divisor (sección `MC`, alma de costado). **Cada estante = marco cerrado de 4 soleras DE CANTO** (naranja,
  "Tomato"; secciones `SUV`/`SUVB` = `SU` girada, alma vertical mirando a la cara exterior) con **juntas a
  tope** (frente/fondo a lo ancho, laterales calzando entre medio, sin superponerse). En modo con placa la
  **placa envuelve la perfilería**: `_shelf` = marco de soleras + tabla del estante + canto frontal; `_partition`
  = placa en **ambas caras** del divisor + canto. `c.soloPerf` (checkbox "Solo perfilería") fuerza estructura
  sin placa en el script (el presupuesto igual computa placa). Otros helpers: `_post`
  (montantes adelante+atrás, centrados en el divisor), `_rod` (barral), `_back` (respaldo), `_screw`, y `_anc`
  (**anclaje** embebido en la superficie de apoyo). `c.apoyo={izq,der,techo,piso,fondo}` indica contra qué
  pared/piso/techo apoya: ahí se **omite la placa exterior** y se siembran anclajes (`_anc` con dir
  `:xneg/:xpos/:zneg/:zpos/:yneg`). `muebleCols(c)` normaliza los anchos de columna al `ancho` total.
  Con `c.medidas` (checkbox "Medidas (cm)") rotula cada **nicho** con `alto×ancho×prof` en cm: en el gráfico
  como `<text class="mbdim">` y en SketchUp con `_txt` (`entities.add_text`) en el frente de cada compartimiento.
  **Perfiles dibujados a mano**: `c.profiles=[{t:'m'|'s', a:[x,y,z], b:[x,y,z]}]` (creados en el visor 3D) se
  emiten con `_beam(we,p0,p1,sec,mat,lay)` (perfil recto entre 2 puntos, `Geom::Transformation.axes`, igual que
  `_beam3d` de Casa). Se suman al cómputo (`computeMueble`) y presupuesto.
  Primer módulo de **mueblería drywall**; la idea es sumar decks y otros muebles después.

**Casa — pipeline de planta**:
- `roomWalls(r, alma)` → 4 muros de una habitación con sus vanos en coords locales.
- `planWalls(p)` → convierte habitaciones (posX/posY) en segmentos absolutos y **fusiona muros
  compartidos colineales** (un solo paño, no doble). `planBBox(p)` → bounding box de la planta.
- `computeCasa(p)` → cómputo (metros, peso, m², techo, entrepiso, platea, volumen madera). Wood-aware.
- `techoRuby(p,bb)` → Ruby del techo por tipo: **Dos aguas / Una agua / Plano / Cuatro aguas**
  (cabriadas + pendolón/webs + correas; cuatro aguas con cumbrera + 4 limatesas). Dos aguas y una agua
  **cierran los hastiales con montantes** (triángulo entre solera y cordón) y una agua **levanta el muro
  alto** (lado BY2) hasta el faldón, para que el techo apoye sobre muro y no quede en el aire.
- `entrepisoRuby(p,bb)` → cenefas PGU + vigas PGC + rigidizadores.
- `cutList(p)` → lista de corte por pieza, agrupada por tipo+perfil+largo con código (M1, K1, D1…).
- `codeMapRuby(p)` → hash Ruby `prefijo|largo → código` (de `cutList`) que se inyecta en el script de
  Casa cuando etiquetas está activo, para rotular cada pieza `código · largo` en 3D.
- `fastenerSchedule(p,c,cl)` → planilla de uniones/fijaciones (tipo de unión → fijación + cantidad); se
  muestra en el panel y se agrega al CSV.
- `optimizeCuts(byProfile, barLen)` → bin-packing First-Fit sobre barras comerciales (6 m).
- `presupuesto(p,c,cl)` / `precios` (localStorage) / `exportCSV(p,c,cl)` → negocio.

**UI**: `renderForm()` (Muro/Cielo, con selector de sistema en Muro), `renderCasaForm()`,
`renderRooms()` (habitaciones + vanos), `renderPlan()` + `startPlanDrag()` (**mini-plano interactivo:
arrastrar las habitaciones para distribuirlas en planta**, snap 50 mm, escribe posX/posY y regenera al soltar),
`genCasa()` (arma script + panel de cómputo/corte/presupuesto).
`renderMuebleForm()` + `renderCloset()` + `startDivDrag`/`startShelfDrag` (**editor de frente interactivo del
mueble**: SVG del alzado con margen; arrastrar divisores dimensiona columnas, doble clic agrega estante,
arrastrarlo lo mueve, ✕ lo quita, ⬒ activa/desactiva barral por columna, y tocar los **bordes TECHO/PISO/PARED**
marca los apoyos (`closet.apoyo`) para omitir placa + anclar), `genMueble()` + `computeMueble()` (cómputo del mueble).
**Tab CREAR** (`data-mod="mueble"`, label "CREAR"): `renderMuebleForm()` es **solo carga de referencia + IA**,
sin editor interactivo. Inputs: varias **imágenes/bocetos** (`cr_imgs` multiple), **video archivo** (`cr_vid`),
**link de YouTube** (`cr_yt`), **descripción** (`cr_desc`) y perfil 35/70. `crearInterpretar()` arma el `content`
multimodal: imágenes → bloques base64; video → `extractFrames(file,6)` (seek + canvas → JPEG base64, ~6 cuadros);
YouTube → se pasa como **texto de referencia** (Claude no reproduce el video, infiere por contexto); llama a la API
(`claude-sonnet-5`, `max_tokens 6000`) con `crearPrompt()` que pide un JSON `{ancho,alto,prof,perfil,profiles:[{t,a,b}]}`.
`applyCrear(p)` vuelca a `closet.profiles` (montante/solera con extremos [x,y,z] mm) y `genMueble()`.
El lienzo 3D interactivo y el editor 2D de frente (`renderCloset3D`/`mb3d*`/`renderCloset`/`startDivDrag`…) quedaron
como **código muerto** (no se llaman). `saveMueble`/`loadMueble` (`.json`) + `pdfMueble` (PDF vía `window.print`);
precios editables en `precios.mueble` (localStorage, base easy.com.ar).
`imgLoadHTML(title,hint)` → bloque UI de carga de imagen, presente en **los cuatro módulos**.
`onImageUpload()` → sube boceto/foto en cualquier módulo y llama a la API de Claude (visión, modelo
`claude-sonnet-5`) para completar el form (Muro/Cielo vía `setFields`/`applyMuro`/`applyCielo`), inferir
habitaciones (Casa) o columnas/estantes/barrales (Mueble vía `applyMueble`). `imgPrompt(scope)` da el prompt por módulo. Requiere sesión de Claude.

---

## Estado actual de features

**Muro**: steel + wood. **Cielorraso**: steel/aluminio.
**Casa** (steel + wood):
- Habitaciones con posición en planta (posX/posY); ensamblado real con **muros compartidos fusionados**.
- **Vanos** por muro: Puerta, Puerta balcón, Ventana, Abertura, Arcada → King, Jack, Dintel
  (2 PGC+1 PGU steel / built-up 2 piezas wood), Cripples sup/inf, solera/durmiente de vano,
  corte de solera inferior en umbrales.
- **Esquinas** multi-montante. **Cruz de San Andrés**. **Placas** de revestimiento (capa Revestimientos).
- **Techo** 4 tipos + correas. **Entrepiso**. **Platea** de hormigón.
- **Wood framing**: secciones sólidas (2x3…2x12), double top plate, dintel built-up, volumen m³, peso Douglas Fir.
- **Fijaciones y herrajes** (checkbox, default ON): anclajes a la platea, hold-downs en esquinas y
  marcadores de tornillo en **todas** las uniones perfil-perfil + **perímetro/líneas de las placas**
  (capas `Herrajes`/`Fijaciones`) + **planilla de uniones**.
- **Revestimiento teselado**: las placas se cortan alrededor de cada abertura (se aprecian todos los cortes).
- **Boceto/foto → medidas/estructura** con IA (visión) en **los tres módulos** (Muro, Cielo, Casa).
- **Lista de corte** por pieza, **presupuestador** con precios en localStorage, **CSV** (con planilla de
  uniones), **optimizador de corte**, **etiquetado 3D** `código · largo` (CODE_MAP, grupos nombrados).

---

## Conocimiento técnico

### Steel frame (IRAM-IAS U 500-205 · Barbieri / ConsulSteel)
- **PGC** (C, montante): ala 40, labio 15. Almas 90/100/140/150/200/250 × esp 0,9/1,25/1,6/2,0.
- **PGU** (U, solera): ala 35, sin labio. Alma ≈ PGC +2 (el PGC encastra dentro; 100→102).
- **PGO** (Omega): 37/22/12,5 — correas y cielorrasos.
- Armado: el PGC encastra dentro del PGU (extremo contra el alma). Modulación estándar 400 mm.
- Vano: solera sup/inf (PGU), montante (PGC), King (montante completo lateral), Jack (corto, sostiene
  dintel), Dintel (2 PGC + 1 PGU), Cripple sup/inf, solera de vano (PGU) largo = ancho + 200 mm.
- Arriostre: Cruz de San Andrés (fleje 30×0,5, atornillado sólo en extremos) o placa OSB/fenólico ≥12 mm.
- Tornillos: T1 hexagonal (estructural), T1 mecha (recibe placa), T2 punta mecha (yeso), T2 con alas (cementicia/OSB/siding).
- Revest kg/m²: yeso 9,5→7 / 12,5→8,9 / 15→10,7 · cementicia 8→13,19 / 12→15,97 · OSB/fenólico 10→7 · siding 12→13,91 · PVC ≈3,5.
- Entrepiso: cenefas PGU + vigas PGC + rigidizador de alma en apoyos. Cabriada: cordones sup/inf + arriostres + correas + Cruz de San Andrés.

### Wood framing (manuales cargados: EWP, entramado ligero, estándares, BIM)
- Escuadrías 2x reales (mm): 2x4=38×89, 2x6=38×140, 2x8=38×184, 2x10=38×235, 2x12=38×286. Douglas Fir ~480 kg/m³.
- Modulación 16"/24" O.C. (406/610 mm). **Double top plate** (solera superior doble) + sole plate simple.
- Studs, king/jack studs, cripples, header (dintel built-up: 2 piezas o LVL), sill plate.
- EWP: LVL (vigas/dinteles), PSL (columnas), LSL (dinteles/rim), Glulam (vigas/curvos), I-Joist (viguetas).
- Sheathing OSB/plywood = muro de corte (shear wall), clavado perimetral. Load path continuo hasta fundación.
- Conectores (Simpson): hold-downs, anchor bolts — modelados como herrajes de referencia + planilla
  (estimación); straps y detalle exacto de cada conector, no.

> Descargo: el cómputo es estimación de costos; el cálculo estructural, arriostres y anclajes los
> define un profesional habilitado. Mantener este descargo en la UI.

---

## Limitaciones conocidas / roadmap

- Arcada = dintel recto (sin arco curvo real).
- Etiquetado 3D rotula cada pieza `código · largo` vía CODE_MAP (match por **prefijo de color + largo**);
  las soleras SP/SV/SD comparten el prefijo `S`, así que a igual largo pueden colisionar en el código.
- Optimizador de corte: no descuenta ancho de sierra ni resuelve empalmes de piezas > barra.
- Placas de revestimiento: teseladas en cortes que descuentan los vanos (se ve cada corte y las aberturas
  libres); no descuentan el solape real entre placas ni la separación de juntas.
- Cuatro aguas: sin cabios secundarios (jack rafters) ni correas en faldones de las puntas; **no lleva
  hastial** (es a 4 aguas). El apoyo del techo (hastiales/muro alto) se resuelve en dos aguas y una agua.
- Cruz de San Andrés: se omite en paños con vano.
- Esquina: aproximación de 2 montantes; con esquinas activas se saltea el montante de extremo del muro
  para evitar solape con el poste (no arma el poste de 3 montantes exacto de ConsulSteel).
- Fijaciones: los marcadores de tornillo se ponen en montantes/kings (no en cada tornillo de placa);
  la planilla es estimación por tipo de unión. Los anclajes apoyan la tuerca sobre la solera y **se saltean
  en umbrales de puerta**; el hold-down es un **fleje STHD14** (flat strap) dibujado en el plano X-Z (queda
  de canto en los muros que corren en Y — es un marcador, no el conector exacto por dirección).
- Plano de habitaciones: el mini-plano permite ubicar cada ambiente libremente (snap 50 mm); para que dos
  muros se fusionen en uno hay que dejarlos alineados dentro de la tolerancia de `alma` (no auto-alinea).
- Cielorraso todavía no tiene variante wood (la carga de imagen sí funciona en Cielo).
- Herramientas externas sugeridas para el flujo (uso, no desarrollo): Profile Builder 4, OpenCutList.

---

## Mapa de archivos

```
adamant-generador-scripts.html   App completa (editar acá)
CLAUDE.md                        Este archivo
README.md                        Setup humano
package.json                     Scripts npm (validate / gen / serve)
tools/su_stub.rb                 Stub de la API de SketchUp para testear el Ruby generado
tools/validate.js                Pipeline de validación (node --check + genera .rb + ruby -c + run)
tools/gen-samples.js             Genera .rb de muestra en tools/out/
tools/out/                       Salida de muestras (git-ignored)
```
