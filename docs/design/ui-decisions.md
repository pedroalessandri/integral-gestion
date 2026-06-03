# UI / Design Decisions

> Running log de decisiones de UI/UX y ajustes visuales del producto.
> Análogo a TODO.md y docs/tech-debt.md, pero específicamente para la
> superficie visual: pantallas, navegación, layouts, microcopia, estados
> vacíos, accesibilidad y patrones de interacción.

## Cómo se usa este doc

- Cada decisión va como una entrada con fecha. Entrada nueva → al tope
  de **Vigentes**.
- Las entradas describen el **qué** y el **por qué** (no son ADRs
  pesados; el detalle de modelado va en ADR si la decisión es
  arquitectónica).
- Cuando una entrada cambia o queda obsoleta, se mueve a **Historial**
  con la fecha y una nota corta del reemplazo.
- Para tweaks visuales chicos (color, spacing, microcopia), una sola
  línea bajo la entrada padre alcanza. No hace falta entrada propia.
- Pendientes de UI van en TODO.md con prefijo `[F]` o `[B]`; este doc
  registra lo **decidido**, no lo pendiente.

---

## Vigentes

### 2026-05-12 — Ajustes Vista Ejecutiva y kebabs en el detalle de objetivo

Cuatro tweaks pre-demo, todos visuales:

**Vista Ejecutiva — eje del Gantt**

- Los anchors de inicio/fin del eje pasan a formato corto **"d MMM"** (ej. "1 ene") en lugar de incluir el año. Cuando el período cruza años, el año queda visible en la banda de meses (ya implementado previamente), así que el año en los anchors era redundante y se pisaba con los ticks intermedios.
- Las **líneas verticales de mes** ahora se extienden a través de todas las filas del Gantt (objetivos, KRs, tareas y placeholders), no solo dentro de la banda del axis. Cada fila renderiza divs absolutos a las mismas pcts que la banda. Color tenue (`var(--color-neutral-100)`), sin pointer-events, por debajo de las barras (las barras quedan visualmente arriba por orden de DOM). Helper `getMonthBoundaryPercentages` extraído en `gantt-axis.tsx` para que `gantt-chart.tsx` calcule las posiciones una sola vez y las pase a cada `GanttRow`.

**Detalle de Objetivo — agrupar acciones en kebabs**

- Se eliminó el botón inline **"+ Nueva tarea"** del header de la sección "Tareas" dentro de cada Resultado Clave. La acción ahora vive como la primera opción (en bold) del kebab del KR (`KrCardActions`), antes de "Editar" / "Eliminar", con un separator. Esto descarga el header de cada KR.
- Se eliminó la dupla **"Rebalancear pesos" + "+ Nuevo Resultado Clave"** del header de la sección "Resultados Clave". Ambas viven ahora en un kebab único (`KrSectionMenu`, colocated en `app/(app)/objectives/[id]/`). "+ Nuevo Resultado Clave" en bold como acción primaria; "Rebalancear pesos" solo aparece cuando hay al menos 2 KRs (misma gating de antes).

**Refactor interno** (sin cambios funcionales sobre creación/edición/rebalanceo):

- `CreateTaskButton`, `CreateKrButton` y `RebalanceWeightsDialog` ahora aceptan `open` / `onOpenChange` opcionales también en modo create. Cuando se pasan, el componente corre controlado y oculta su trigger. Permite abrirlos desde un `DropdownMenuItem` u otro punto remoto sin duplicar la lógica del diálogo.

---

### 2026-05-12 — Filas de tarea: títulos legibles en el detalle del objetivo

**Contexto.** En `/objectives/[id]`, cada fila de tarea bajo un Resultado Clave forzaba el título a una sola línea con `truncate`, así que tareas con enunciado largo (lo típico cuando se redacta SMART) quedaban cortadas. La fila además gastaba espacio horizontal en los labels textuales "peso …" y "Completar".

**Decisión.**

- El título de la tarea ahora **wrappea a múltiples líneas** (`break-words`, sin `truncate`). El alto de la fila se adapta. La columna de peso, fecha, slider y acciones quedan centradas vertically contra el bloque del título.
- La columna de peso muestra **solo el número** (ej. "25%") sin la palabra "peso". Se mantiene `title="Peso"` para tooltip al hover por accesibilidad.
- El botón **Completar** pasa a icon-only (CheckCircle2). Tooltip y `aria-label="Marcar como completada"` quedan, así no se pierde semántica para lectores de pantalla. Botón cuadrado 28x28 px para que el icono respire.
- Status icon de la tarea ahora se alinea al top del bloque del título (con `mt-0.5`), no al medio. Si el título wrappea a varias líneas, el icono queda al lado de la primera línea, no flotando al medio.

---

### 2026-05-12 — Terminología en UI: "Key Result(s)" / "KR(s)" → "Resultado(s) Clave"

**Decisión.** Toda mención visible al usuario de "Key Result", "Key Results", "KR" o "KRs" se reemplaza por "Resultado Clave" / "Resultados Clave" en el UI. Aplica a: títulos de diálogos, botones, labels, placeholders, aria-labels, tooltips, mensajes de confirmación destructiva, empty states y banners.

Se eligió expandir la forma completa en vez de introducir una nueva sigla "RC" para no inventar una abreviatura nueva que no se usa en la conversación.

**Fuera de alcance (queda en inglés).**

- Backend, modelo y APIs: tipos (`KeyResultDto`), endpoints (`/api/v1/okr/key-results/...`), columnas de DB, nombres de archivos (`create-kr-button.tsx`, `kr-card-actions.tsx`), variables (`keyResults`, `krId`, `krs`), componentes (`KrCard`, `CreateKrButton`).
- Comentarios JSDoc y `{/* … */}`: documentan el concepto a nivel código y se quedan en inglés para no romper la consistencia con el dominio del backend.
- "OKR" como nombre de la metodología (no se traduce).

Reglita operativa para el futuro: si entra un nuevo string visible al usuario, "Resultado Clave" / "Resultados Clave". Si entra código nuevo (variable, tipo, archivo, endpoint), se sigue usando "key result" / "kr" en inglés.

---

### 2026-05-12 — Vista Ejecutiva: objetivos colapsables

**Contexto.** El Gantt de la Vista Ejecutiva mostraba siempre todos los KRs (y opcionalmente las tareas) de cada Objetivo. Con varios objetivos por período la lista se hace muy larga y dificulta comparar headlines.

**Decisión.**

- Cada fila de Objetivo trae ahora un **chevron** a la izquierda del título que colapsa/expande sus KRs (y, cuando "Mostrar tareas" está activo, también las tareas dentro de esos KRs). Estado: descolapsado por default. Iconos: `ChevronDown` (abierto) / `ChevronRight` (colapsado).
- Arriba a la derecha del card, junto al toggle "Mostrar tareas", aparece un **botón icon-only** que colapsa o expande **todos** los objetivos a la vez. Sin label visible; el tooltip se invierte según el estado actual:
  - Si al menos un objetivo está expandido → tooltip "Colapsar", icono `ChevronsDownUp`.
  - Si todos están colapsados → tooltip "Expandir", icono `ChevronsUpDown`.
- El estado se mantiene en el cliente (useState en `gantt-chart.tsx`). No se persiste entre cargas todavía — al refrescar la página, vuelven todos expandidos. Si pide persistencia, se mueve a localStorage o cookie en una corrida aparte.
- Cuando no hay objetivos en el período, el toggle global queda deshabilitado.

---

### 2026-05-11 — Demo polish: zona peligrosa, suma de pesos y eje de la Vista Ejecutiva

Tres ajustes visuales pedidos antes de la demo.

**Detalle del objetivo (`/objectives/[id]`)**

- Se elimina la sección **"Zona peligrosa"** al pie de la página. La eliminación de objetivos sigue disponible desde el listado (`/objectives`), que es donde tiene sentido pasar al destructive flow. Mantener una zona roja siempre visible en el detalle aporta más ruido que valor.
- La **leyenda de suma de pesos** ahora tiene dos estados:
  - **Balanceado (suma = 100%)**: pasa a ser un caption mínimo abajo a la derecha, "✓ Pesos balanceados", en gris con tilde verde. No ocupa espacio visual relevante.
  - **Desbalanceado**: se mantiene el banner amarillo con la suma actual y el call-to-action. La señal fuerte aparece solo cuando hay algo que corregir.

**Vista Ejecutiva — eje del Gantt**

- Se agrega una **banda de meses** arriba del eje de días. Cada mes que intersecta el período ocupa un span proporcional con su nombre centrado (ej. "ene", "feb", "mar"). Si el período cruza años, el label incluye el año ("ene 2026") para desambiguar.
- El eje de días/semanas/meses se mantiene debajo con la lógica adaptativa existente. La banda funciona como marco de referencia siempre presente, así que un "5" suelto al medio del eje deja de ser ambiguo: cae visualmente dentro del span del mes que le corresponde.
- Spans con menos de ~6% del ancho del eje ocultan su label para no apilar tipografía sobre meses muy parciales. El borde izquierdo de cada span queda visible igual, así la separación temporal se ve aunque el label no entre.

**Fuera de alcance.** Líneas verticales de mes a través de las filas del Gantt (estilo grid extendido): se evaluó pero suma complejidad sin gran ganancia visual sobre la banda. Se puede revisitar si la demo lo justifica.

---

### 2026-05-11 — Pantalla Inicio (`/dashboard`) como hub de módulos por organización

**Contexto.** La ruta `/dashboard` mostraba el JSON crudo de
`GET /api/v1/me` como placeholder. Se necesita una primera pantalla
post-login que (a) sirva como punto de aterrizaje real, (b) escale a N
módulos (hoy solo OKR; más adelante otros), (c) sea entendible en una
demo sin explicación.

**Decisión.**

- La ruta `/dashboard` (entrada "Dashboard" del sidebar) renderiza la
  pantalla **Inicio**: encabezado con saludo + tabla de organizaciones
  del usuario.
- Una fila por organización. Columnas:
  - **Organización**: nombre + slug en gris pequeño debajo.
  - **Rol**: badge con el rol del usuario en esa org.
  - **Módulos**: chips clickeables, uno por módulo habilitado. Cada
    chip lleva al entry point del módulo. Si la org no tiene módulos
    habilitados → texto "Sin módulos habilitados".
- Click en un chip de módulo: cambia el `activeOrgId` cookie a esa org
  y navega al entry point. Así el usuario puede saltar entre orgs sin
  pasar por el dropdown del topbar.
- Superadmin: ve todas las orgs (lo que ya devuelve `/me`), con badge
  "Superadmin" mantenido en el topbar.
- Empty state: si el usuario no pertenece a ninguna organización, se
  muestra un cartel explicativo.

**Registro de módulos en el frontend.** El backend devuelve
`enabledModules: string[]` por organización (vía `/me`) y el catálogo
global con `name`+`description` (vía `/modules`). Para mapear cada
key a su entry route, se mantiene un registry chico en frontend:
`MODULE_ROUTES = { okr: '/objectives', ... }`. Cuando se agrega un
módulo, se suma una entrada acá y al INSERT en `core.module`. Si un
módulo del catálogo no está mapeado en el registry, el chip aparece
en estado deshabilitado con tooltip "Próximamente".

**No alcance / fuera de esta entrada.**

- Métricas o widgets de "actividad reciente" en la home — no entran
  todavía. Si se piden, se agrega entrada nueva.
- Renombrar el slug `/dashboard` o la etiqueta del sidebar — la
  pantalla se llama "Inicio" en el título, la nav sigue diciendo
  "Dashboard" hasta que se decida si conviene un rename global.
- Endpoint nuevo: no se crea. Se reutilizan `/me` y `/modules`.

---

## Historial

(Vacío — primer entrada todavía vigente.)
