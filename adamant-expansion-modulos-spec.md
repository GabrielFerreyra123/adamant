# ADAMANT — Expansión a múltiples tipos de construcción (F6–F8)

## Premisa

El MVP (F1–F5) resuelve un solo tipo: muro/tabique con vanos. Adamant debe crecer a más tipos de construcción sin que cada agregado rompa lo anterior. Regla general: **cada tipo nuevo se construye como un módulo aislado que pasa por el mismo pipeline** (motor → tests → visor → wizard → materiales/cortes/PDF → export Ruby), una fase por vez, con freno para revisión entre fases.

## F6 — Refactor a arquitectura de módulos (SIN funcionalidad nueva)

Antes de agregar tipos, preparar la casa. Objetivo: que agregar un tipo de construcción sea "registrar un módulo", no tocar el core.

1. Crear un **registro de módulos constructivos** (`src/engine/modules/`). Cada módulo expone la misma interfaz:
   - `id`, `nombre`, `descripcion`, `icono`
   - `schema` de inputs (campos, rangos, defaults por sistema steel/wood) → el wizard se autogenera desde acá
   - `generar(params) → { piezas[], metadatos }`
   - `materiales(piezas, sistema)` y reglas de unidades de venta propias
2. Migrar el módulo actual **Muro/Tabique** a esta interfaz sin cambiar su comportamiento: los tests existentes deben pasar sin modificaciones (ese es el criterio de aceptación del refactor).
3. El visor, la lista de cortes, el PDF y el export Ruby deben consumir solo `piezas[]` + metadatos, sin lógica condicional por tipo de módulo (si hoy hay `if (tipo === 'muro')` en el viewer o en pdf.js, eliminarlos).
4. La pantalla 1 del wizard pasa de toggle fijo a **grilla de tipos de construcción** generada desde el registro.

**Criterio de aceptación F6:** misma app que antes para el usuario, todos los tests en verde, y un módulo dummy de prueba (ej. "columna simple") se puede agregar tocando solo `src/engine/modules/`.

## F7 — Módulo: Entramado de Piso (plataforma)

Primer tipo nuevo. Es la plataforma sobre la que después se montan los muros (platform framing).

### F7a — Motor + tests

Geometría del entramado de piso rectangular:
- **Vigas (joists)**: paralelas al lado corto por default (luz menor), separación 400 mm (opción 600). Steel: PGC de alma alta (100/150/200 según luz, con tabla de luces máximas orientativas en comentario). Wood: 2x8 (38x184) default, opción 2x6/2x10 según luz.
- **Cenefa perimetral (rim joist)**: perimetral en los cuatro lados. Steel: PGU. Wood: misma escuadría que las vigas.
- **Viga doble** en los dos bordes paralelos a las vigas (arranque y cierre).
- **Blocking (bloqueos/cortafuegos)**: fila de bloqueos a mitad de luz cuando la luz supera 2,40 m; cada 2,40 m si es mayor.
- **Placa de piso (multiplacado)**: OSB/fenólico 18 mm en placas de 1,22 x 2,44, contabilizado en materiales (cantidad de placas con desperdicio), no modelado pieza por pieza en el 3D (una superficie simple opcional con toggle "mostrar placa").
- Inputs del wizard: largo, ancho, separación, sistema, escuadría/perfil (avanzado, con default por luz), toggle placa.
- Sin vanos en esta versión (escalera/trampa queda para una fase futura — dejarlo anotado, no implementarlo).

Tests mínimos (8 casos con cantidades calculadas a mano): piso 3x3 y 4x5 en ambos sistemas, con y sin blocking, verificando cantidad de vigas (ceil+1 como en muros), cenefas, dobles y bloqueos.

### F7b — Visor

El piso renderiza acostado (plano XZ en Three), vigas con color propio agregado a la leyenda, cenefa y blocking distinguibles. Cámara inicial en isométrica que encuadre la plataforma completa. Bounding box test: alto (Y) ≈ alma de la viga, no metros.

### F7c — Wizard + salidas

Integración completa por el pipeline existente: wizard autogenerado desde el schema, materiales en unidades de venta (vigas de 6 m steel / tirantes 3,05-4,88 m wood, placas, fijaciones), cortes con optimización por barra, PDF con esquema en planta acotado (no frontal), export Ruby con paridad geométrica.

**Criterio de aceptación F7:** un usuario arma un piso de 3x4 m en menos de 2 minutos, descarga PDF legible con esquema en planta, y el toggle steel/wood recalcula todo. Tests del módulo muro siguen en verde (no-regresión).

## F8 — Módulo: Cielorraso suspendido (port del legacy)

El app legacy ya tiene este módulo resuelto en Ruby: portarlo a la interfaz de módulos (motor JS + tests contra las cantidades del legacy), y pasarlo por el mismo pipeline F7b/F7c. Es el módulo más barato de agregar y valida que la arquitectura escala.

## Backlog ordenado (NO implementar todavía — solo dejar registrado en un TODO.md)

1. Vano de escalera/trampa en piso (vigas dobles de borde de vano + cabezales)
2. Techo: cabreadas/cerchas simples a dos aguas
3. Muro exterior portante con Cruz de San Andrés (arriostramiento)
4. Proyecto combinado: piso + 4 muros (quincho/habitación completa) reutilizando módulos
5. Precios compartidos entre módulos (un solo listado de precios por usuario en localStorage)

## Reglas de trabajo (idénticas al spec original)

- Una fase por vez (F6 → F7a → F7b → F7c → F8), tests en verde y freno para revisión antes de seguir.
- La lista de cortes SIEMPRE deriva de piezas[] (única fuente de verdad).
- Mobile-first 390 px en toda pantalla nueva.
- No agregar nada del backlog sin instrucción explícita.
