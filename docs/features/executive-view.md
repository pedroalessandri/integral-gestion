# Vista Ejecutiva — Análisis funcional

## 1. Resumen ejecutivo

La Vista Ejecutiva es un dashboard de tipo Gantt que muestra la cascada completa de Objetivos → Key Results (y opcionalmente Tareas) de un período seleccionado, proyectada sobre un eje de tiempo. Su propósito es darle a ejecutivos y stakeholders una lectura de situación de un vistazo: qué se comprometió, cuánto avanzó y dónde están las demoras, sin necesidad de entrar objetivo por objetivo. No está destinada a operadores que cargan progreso ni a admins que configuran el sistema.

El problema que resuelve es la dispersión: hoy para tener una imagen completa del período hay que abrir cada objetivo en detalle. La vista ejecutiva consolida todo en una sola pantalla scrolleable, usando barras de Gantt posicionadas sobre el rango de fechas del período, coloreadas por estado (pendiente, en curso, completado, vencido).

Lo que esta feature explícitamente NO hace: no permite editar datos (es solo lectura), no exporta a PDF o imagen, no soporta múltiples períodos simultáneos, no muestra dependencias entre ítems, no permite arrastrar/redimensionar barras, no incluye vistas de períodos futuros, y no filtra por propietario o estado. Toda esa funcionalidad queda fuera de alcance en esta iteración.

---

## 2. URL y navegación

Ruta: `/objectives/executive`

El usuario llega desde dos puntos de entrada:

1. **Header de la página de lista de objetivos** (`/objectives`) — agregar un botón o link "Vista Gantt" a la derecha del título "Objetivos", junto al selector de período existente. Sugerencia concreta: un `<Button variant="outline" size="sm">` con icono `BarChart2` de lucide-react, ubicado en el grupo `flex items-center gap-2` que ya contiene `ClosePeriodButton` y `CreateObjectiveButton`.

2. **Sidebar de la aplicación** (`apps/web/src/components/app-shell.tsx`) — agregar un ítem de navegación "Vista Ejecutiva" bajo el grupo de OKR, con icono `GanttChart` de lucide-react, apuntando a `/objectives/executive`.

El selector de período de la Vista Ejecutiva usa query param `?periodId=`, igual que la lista: `/objectives/executive?periodId=<uuid>`. Sin `periodId`, se aplica la lógica de selección por defecto (ver §6).

---

## 3. Layout principal (wireframe)

Vista de 2 niveles por defecto (Objetivos > KRs). Ancho de referencia: 1280px.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│  Objetivos — Vista Ejecutiva                                                                  │
│  Período [2026-Q1 · Abierto v]                                         [Mostrar tareas: OFF] │
├──────────────────────────┬───────────────────────────────────────────────────────────────────┤
│  Ítem                    │  ene 2026        feb 2026        mar 2026        abr 2026          │
├──────────────────────────┼───────────────────────────────────────────────────────────────────┤
│  Objetivo 1        72%   │  ░░░░████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░        │
│  [en curso]              │                                                                   │
│    KR 1.1          85%   │      ░░░░████████████████████████░░░░░░░░░░░░░░░░░░░░░░           │
│    [en curso]            │                                                                   │
│    KR 1.2          60%   │            ░░░░░░░████████████░░░░░░░░░░░░░░░░░░░░░░░░░           │
│    [en curso]            │                                                                   │
│    KR 1.3           0%   │  Sin KRs con tareas ·············································  │
│    [pendiente]           │                                                                   │
├──────────────────────────┼───────────────────────────────────────────────────────────────────┤
│  Objetivo 2       100%   │  ░░░░████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
│  [completado]            │                                                                   │
│    KR 2.1         100%   │  ░░░░████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░        │
│    [completado]          │                                                                   │
├──────────────────────────┼───────────────────────────────────────────────────────────────────┤
│  Objetivo 3        10%   │                       ░░░░░░░██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
│  [vencido]               │                                                                   │
│    KR 3.1          10%   │                       ░░░░░░░██░░░░░░░░░░░░░░░░░░░░░░░░░░░        │
│    [vencido]             │                                                                   │
└──────────────────────────┴───────────────────────────────────────────────────────────────────┘

Leyenda de barra:  ░ = espacio vacío del período  █ = progreso real  · = sin fechas (placeholder)
```

Notas de layout:
- Columna izquierda fija (~280px), columna derecha scrolleable horizontalmente si el período es largo.
- Filas de Objetivo tienen fondo levemente diferenciado (`--color-neutral-50`); filas de KR son blancas con indent de 24px.
- El porcentaje se muestra como número (p. ej. `72%`) en la columna izquierda, derivado de `progressCachedBp / 100`.
- El badge de estado `[en curso]` usa el mismo `StatusBadge` existente (`apps/web/src/components/objectives/status-badge.tsx`).

---

## 4. Estado expandido con tareas (wireframe)

Toggle "Mostrar tareas" en ON. Sub-filas de tarea se insertan bajo cada KR, con indent adicional de 24px (total 48px desde el borde).

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│  Objetivos — Vista Ejecutiva                                                                  │
│  Período [2026-Q1 · Abierto v]                                         [Mostrar tareas: ON ] │
├──────────────────────────┬───────────────────────────────────────────────────────────────────┤
│  Ítem                    │  ene 2026        feb 2026        mar 2026        abr 2026          │
├──────────────────────────┼───────────────────────────────────────────────────────────────────┤
│  Objetivo 1        72%   │  ░░░░████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░        │
│  [en curso]              │                                                                   │
│    KR 1.1          85%   │      ░░░░████████████████████████░░░░░░░░░░░░░░░░░░░░░░           │
│    [en curso]            │                                                                   │
│      Tarea A       100%  │      ░░░░████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░           │
│      [completada]        │                                                                   │
│      Tarea B        70%  │              ░░░░░░░█████████████░░░░░░░░░░░░░░░░░░               │
│      [en curso]          │                                                                   │
│      Tarea C         0%  │  Sin fechas — corregir tarea ···································  │
│      [pendiente]         │                                                                   │
│    KR 1.2          60%   │            ░░░░░░░████████████░░░░░░░░░░░░░░░░░░░░░░░░░           │
│    [en curso]            │                                                                   │
│      Tarea D        60%  │            ░░░░░░░████████████░░░░░░░░░░░░░░░░░░░░░░░░░           │
│      [en curso]          │                                                                   │
└──────────────────────────┴───────────────────────────────────────────────────────────────────┘
```

Cuando un KR no tiene tareas, la sección expandida muestra una fila vacía de 24px de alto con texto "Sin tareas asignadas" en `--color-neutral-300`, sin barra.

---

## 5. Estado vacío (wireframe)

### (a) Período sin objetivos

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│  Objetivos — Vista Ejecutiva                                                                  │
│  Período [2026-Q2 · Abierto v]                                         [Mostrar tareas: OFF] │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                              │
│                          [ Target ]                                                          │
│                   Sin objetivos este período                                                 │
│          Creá objetivos en la lista para verlos aquí.                                        │
│                    [→ Ir a lista de objetivos]                                               │
│                                                                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### (b) Objetivos sin KRs

```
├──────────────────────────┬───────────────────────────────────────────────────────────────────┤
│  Objetivo sin KRs   0%   │  Sin KRs — este objetivo no tiene resultados clave definidos ···  │
│  [pendiente]             │                                                                   │
└──────────────────────────┴───────────────────────────────────────────────────────────────────┘
```

El objetivo aparece en la lista (con su fila) pero sin barra de Gantt. El texto placeholder se muestra en gris claro (`--color-neutral-300`). El click al nombre del objetivo navega igualmente.

### (c) KRs sin tareas (modo expandido)

```
│    KR sin tareas     0%  │  Sin tareas asignadas ··········································  │
│    [pendiente]           │                                                                   │
```

En modo colapsado (2 niveles), la fila del KR aparece con barra vacía o placeholder, no se oculta.

---

## 6. Selector de período

El selector es un `DropdownMenu` ubicado en el header de la página, a la derecha del título "Vista Ejecutiva". Muestra únicamente períodos con estado `open` o `closed` — los períodos `future` NO aparecen.

Cada ítem del dropdown muestra: `[código] · [estado]` — p. ej. `2026-Q1 · Abierto` o `2025-Q4 · Cerrado`.

**Lógica de selección por defecto** (en ausencia de query param `?periodId=`):
1. Si existe exactamente un período `open`, seleccionarlo.
2. Si no hay período abierto, seleccionar el período `closed` más reciente (mayor `endsAt`).
3. Si no hay ningún período `open` ni `closed`, mostrar estado vacío con CTA "Crear período" (link a `/orgs/[orgId]/periods/new` para superadmins, o mensaje de contacto al admin para el resto).

El período `future` se excluye explícitamente porque no tiene objetivos cargados que valga la pena visualizar en Gantt.

La selección modifica el query param `?periodId=` de la URL, produciendo una nueva request al servidor (Server Component) — no hay estado del cliente para el período.

---

## 7. Toggle "Mostrar tareas"

**Ubicación**: extremo derecho del header de la página, alineado con el selector de período. Implementado como un `<Switch>` de shadcn/ui con label "Mostrar tareas".

**Estado por defecto**: OFF (2 niveles: Objetivos + KRs).

**Estado del cliente**: el toggle es puramente client-side. Se gestiona con `useState` en el componente raíz de la página (`'use client'`). No produce ninguna request adicional al servidor — los datos de tareas ya vienen incluidos en la respuesta del endpoint (decisión #1: Tasks siempre incluidas server-side).

**Efecto visual cuando se activa**:
- Bajo cada fila de KR aparecen sub-filas de tarea (una por tarea activa del KR), indentadas 48px desde el borde.
- Si un KR no tiene tareas, aparece una fila vacía de placeholder "Sin tareas asignadas" (24px de alto, texto `--color-neutral-300`).
- La altura total del Gantt aumenta; el scroll vertical del contenedor se ajusta automáticamente.

**Efecto visual cuando se desactiva**: las filas de tarea desaparecen. Las filas de KR permanecen en el mismo lugar.

El estado del toggle no se persiste en URL ni en localStorage en esta iteración.

---

## 8. Algoritmo del Gantt

### Eje X

El eje X cubre exactamente el rango `[period.startsAt, period.endsAt]`. La unidad base es el día.

Densidad adaptativa de etiquetas según duración del período:
- Período <= 30 días: etiqueta por día, formato `"15"` (día del mes).
- Período <= 90 días: etiqueta por semana (lunes), formato `"15 abr"`.
- Período > 90 días: etiqueta por mes, formato `"abr 2026"`.

Ancho mínimo de barra: 4px (garantiza visibilidad de ítems de un día en períodos largos).

### Posición y ancho de barra

Dado un contenedor de ancho `W` píxeles que representa el rango total del período:

```
periodDays = (period.endsAt - period.startsAt) en días (inclusive)
pxPerDay   = W / periodDays

barLeft  = max(0, (item.startsAt - period.startsAt) en días) * pxPerDay
barRight = min(W, (item.endsAt   - period.startsAt) en días + 1) * pxPerDay
barWidth = max(4, barRight - barLeft)   // mínimo 4px
```

Las fechas se convierten a días redondeando al inicio del día UTC antes de la diferencia.

### Relleno de la barra (fill)

La barra tiene dos capas superpuestas:
1. Fondo completo de la barra (desde `barLeft` hasta `barLeft + barWidth`): color de estado con opacidad baja (aprox. 20%).
2. Relleno de progreso (desde `barLeft` hasta `barLeft + barWidth * fill`): color de estado a opacidad completa.

```
fill = item.progressCachedBp / 10000   // 0.0 … 1.0
fillWidth = max(4, barWidth * fill)    // mínimo 4px si fill > 0
```

Para tareas, usar `progressBp` en lugar de `progressCachedBp`.

### Color por estado

| Estado       | Color token                | Uso                              |
|--------------|----------------------------|----------------------------------|
| `pending`    | `--color-neutral-300`      | Barra fondo + fill               |
| `in_progress`| `--color-info` (#3b82f6)   | Barra fondo tenue + fill solido  |
| `done`       | `--color-success` (#10b981)| Barra fondo tenue + fill solido  |
| `overdue`    | `--color-danger` (#ef4444) | Barra fondo tenue + fill solido  |

### Casos borde de fechas

**item.startsAt o item.endsAt es null (Objetivo o KR sin hijos)**:
- No renderizar barra.
- Mostrar texto placeholder en la celda derecha: "Sin tareas" (KR) o "Sin KRs con tareas" (Objetivo).
- Color: `--color-neutral-300`, estilo punteado con caracteres `·`.

**item.startsAt o item.endsAt es null (Tarea)**:
- Las tareas tienen fechas NOT NULL en la DB desde la migración de fechas derivadas; no debería ocurrir.
- Defensivo: no renderizar barra, mostrar "Sin fechas — corregir tarea" en `--color-neutral-300`.
- La fila sigue siendo clickeable.

**Fechas fuera del rango del período** (item.startsAt < period.startsAt o item.endsAt > period.endsAt):
- Clipear la barra al rango del período (aplicar `max`/`min` en el cálculo de posición, ver fórmula arriba).
- No mostrar advertencia visual en esta iteración; se registra como caso borde conocido.

---

## 9. Estados visuales

Los estados y sus colores siguen exactamente el `StatusBadge` existente en `apps/web/src/components/objectives/status-badge.tsx`:

| Estado       | Label        | Badge bg             | Badge text          | Barra (token)            |
|--------------|--------------|----------------------|---------------------|--------------------------|
| `pending`    | Pendiente    | `bg-neutral-100`     | `text-neutral-600`  | `--color-neutral-300`    |
| `in_progress`| En curso     | `bg-blue-50`         | `text-blue-700`     | `--color-info` (#3b82f6) |
| `done`       | Completado   | `bg-green-50`        | `text-green-700`    | `--color-success` (#10b981)|
| `overdue`    | Vencido      | `bg-red-50`          | `text-red-700`      | `--color-danger` (#ef4444)|

Nota de seguimiento: tras la corrida beta de reemplazo de íconos, los badges y colores de estado se reemplazan parcialmente por íconos. Actualizar esta sección y los componentes `gantt-bar` / `gantt-row` cuando la corrida beta se implemente.

---

## 10. Interactividad

**Click en nombre de Objetivo** → navegar a `/objectives/[objectiveId]`.

**Click en nombre de KR** → navegar a `/objectives/[objectiveId]#kr-[krId]`.

**Click en nombre de Tarea** → navegar a `/objectives/[objectiveId]#task-[taskId]`.

**Click en barra de Gantt** → misma navegación que el click en el nombre del ítem correspondiente (la barra actúa como superficie de click secundaria).

**No hay hover preview** en esta iteración. El cursor cambia a `pointer` sobre nombres y barras clickeables.

Nota sobre anchors en la página de detalle: para que los links `#kr-[id]` y `#task-[id]` funcionen correctamente, la página de detalle (`/objectives/[id]`) debe agregar `id="kr-[id]"` e `id="task-[id]"` a los elementos correspondientes, junto con lógica de `scrollIntoView` + highlight al montar cuando la URL contiene un hash. Este trabajo está diferido como tarea futura y no forma parte de esta corrida de implementación.

---

## 11. Casos borde y decisiones

1. **0 objetivos en el período**: mostrar estado vacío (§5a) con link a la lista de objetivos. No renderizar la tabla ni el eje de fechas.

2. **Todos los objetivos al 100%**: el Gantt se muestra normalmente, todas las barras en color `--color-success`. No hay comportamiento especial.

3. **Fechas fuera del rango del período**: la barra se clipea visualmente al rango del período (ver §8). Si el ítem empieza antes que el período, la barra empieza en el borde izquierdo; si termina después, se trunca en el borde derecho. Sin advertencia visual en esta iteración.

4. **Período cerrado con ítems sin completar**: se visualiza normalmente, en modo solo lectura (no hay acciones de edición en la Vista Ejecutiva de todas formas). Los ítems vencidos muestran estado `overdue` y barra roja.

5. **Máximo de objetivos esperado**: se asume hasta ~30 objetivos por período, 5 KRs promedio por objetivo, 5 tareas promedio por KR (~750 nodos en modo expandido). Con este volumen no se requiere virtualización en esta iteración (ver §12).

6. **Window resize / responsive**: el ancho del contenedor Gantt es fluido (flex o CSS grid). Al redimensionar la ventana, las barras se recalculan usando porcentajes CSS (`left` y `width` como `%` del contenedor, no píxeles absolutos). Esto evita la necesidad de un ResizeObserver.

7. **Pantalla objetivo**: desktop primario (>= 1024px). Tablet aceptable (>= 768px, scroll horizontal en el Gantt). Mobile fuera de alcance — en pantallas < 768px se puede mostrar un mensaje "Esta vista está optimizada para pantallas grandes" y un link a la lista estándar.

---

## 12. Performance y escalabilidad

**Volumen estimado**: ~30 objetivos * 5 KRs * 5 tareas = ~750 nodos en modo expandido. Con este tamaño, un único fetch al endpoint de Gantt devuelve < 100KB de JSON. No se requiere paginación ni virtualización en esta iteración.

**Decisión de no virtualizar**: a 750 nodos con filas de altura fija (~40px), la altura total del DOM es ~30.000px en modo expandido, lo cual es manejable sin virtualización (react-window, etc.) para la mayoría de los browsers modernos. Si el volumen crece más allá de 100 objetivos, se deberá revisar.

**Endpoint dedicado**: usar `GET /api/v1/okr/objectives/gantt?periodId=...` (ver §13) en lugar de hacer N+1 calls a `/cascade`. El backend resuelve el árbol completo en una sola query con `include` de Prisma.

**Pre-agregación**: los campos `progressCachedBp` ya vienen pre-computados en la DB (recompute helper de `feat/derived-dates-balance-warnings-and-fixes`). No hay cómputo de cascada en el servidor para este endpoint, solo proyección de datos existentes.

**Caching**: en Next.js App Router, el Server Component puede beneficiarse del cache de `fetch` por `periodId`. Para períodos cerrados (inmutables), se puede agregar `{ next: { revalidate: 3600 } }` al fetch. Para períodos abiertos, no cachear (o revalidar en pocos segundos).

**Scroll**: la columna de fechas scrollea horizontalmente dentro del contenedor. La columna de nombres de ítems es sticky (CSS `position: sticky; left: 0`) para mantener legibilidad durante el scroll horizontal.

---

## 13. Data shape esperada del API

### Endpoint

```
GET /api/v1/okr/objectives/gantt?periodId=<uuid>
Authorization: Bearer <token>
X-Org-Id: <orgId>
```

### DTOs (a agregar en `packages/shared-types/src/okr/`)

```typescript
// TaskGanttDto
interface TaskGanttDto {
  id: string;
  title: string;
  status: TaskStatus;          // 'pending' | 'in_progress' | 'done' | 'overdue'
  progressBp: number;          // 0..10000
  startsAt: string;            // ISO-8601 UTC
  endsAt: string;              // ISO-8601 UTC
}

// KeyResultGanttDto
interface KeyResultGanttDto {
  id: string;
  title: string;
  status: ProgressStatus;      // 'pending' | 'in_progress' | 'done'
  progressCachedBp: number;    // 0..10000
  startsAt: string | null;     // null si el KR no tiene tareas con fechas
  endsAt: string | null;
  tasks: TaskGanttDto[];
}

// ObjectiveGanttDto
interface ObjectiveGanttDto {
  id: string;
  title: string;
  status: ProgressStatus;
  progressCachedBp: number;    // 0..10000
  startsAt: string | null;     // null si el objetivo no tiene KRs con tareas
  endsAt: string | null;
  keyResults: KeyResultGanttDto[];
}
```

La respuesta del endpoint es `ObjectiveGanttDto[]` (array directo, no paginado).

### Ejemplo de respuesta

```json
[
  {
    "id": "obj-uuid-1",
    "title": "Mejorar la satisfacción del ciudadano",
    "status": "in_progress",
    "progressCachedBp": 6800,
    "startsAt": "2026-01-06T00:00:00.000Z",
    "endsAt": "2026-03-28T00:00:00.000Z",
    "keyResults": [
      {
        "id": "kr-uuid-1",
        "title": "Reducir tiempo de respuesta a 48hs",
        "status": "in_progress",
        "progressCachedBp": 8500,
        "startsAt": "2026-01-06T00:00:00.000Z",
        "endsAt": "2026-02-28T00:00:00.000Z",
        "tasks": [
          {
            "id": "task-uuid-1",
            "title": "Mapear flujo actual de atención",
            "status": "done",
            "progressBp": 10000,
            "startsAt": "2026-01-06T00:00:00.000Z",
            "endsAt": "2026-01-31T00:00:00.000Z"
          },
          {
            "id": "task-uuid-2",
            "title": "Implementar sistema de tickets",
            "status": "in_progress",
            "progressBp": 7000,
            "startsAt": "2026-02-01T00:00:00.000Z",
            "endsAt": "2026-02-28T00:00:00.000Z"
          }
        ]
      },
      {
        "id": "kr-uuid-2",
        "title": "Habilitar canal digital de consultas",
        "status": "pending",
        "progressCachedBp": 0,
        "startsAt": null,
        "endsAt": null,
        "tasks": []
      }
    ]
  }
]
```

---

## 14. Out of scope

Los siguientes ítems están explícitamente fuera del alcance de esta feature:

- Exportar la vista a PDF o imagen.
- Arrastrar o redimensionar barras para editar fechas.
- Dependencias entre ítems (flechas de Gantt).
- Edición inline de títulos o progreso desde la vista Gantt.
- Hover preview con datos adicionales del ítem.
- Visualización de múltiples períodos en simultáneo.
- Filtros por estado (`pending`, `in_progress`, etc.).
- Filtros por propietario (owner).
- Filtros por KR individual.
- Selección de períodos futuros en el dropdown.
- Persistencia del estado del toggle "Mostrar tareas" en URL o localStorage.
- Anchors + scroll-on-hash en la página de detalle (listado como trabajo futuro en §15).
- Vista móvil (< 768px).
- Actualización en tiempo real (WebSocket/polling).

---

## 15. Implementación sugerida (alto nivel)

- **Backend — nuevo endpoint**: implementar `GET /api/v1/okr/objectives/gantt?periodId=` en el módulo `okr`. El service ejecuta una única query Prisma con `include: { keyResults: { include: { tasks: true } } }` filtrada por `periodId` y `organizationId`. Proyectar a `ObjectiveGanttDto[]`. No requiere migración de DB.

- **Shared-types — nuevos DTOs**: agregar `TaskGanttDto`, `KeyResultGanttDto`, `ObjectiveGanttDto` a `packages/shared-types/src/okr/` y exportarlos desde `index.ts`.

- **Frontend — nueva ruta**: crear `apps/web/src/app/(app)/objectives/executive/page.tsx` como Server Component. Resuelve el período por defecto (lógica de §6), llama al endpoint Gantt, pasa los datos al componente cliente.

- **Frontend — componentes nuevos**: crear bajo `apps/web/src/components/gantt/`:
  - `gantt-chart.tsx` — contenedor principal con scroll horizontal.
  - `gantt-axis.tsx` — fila del eje de fechas con densidad adaptativa.
  - `gantt-row.tsx` — fila genérica (Objetivo, KR o Tarea) con nombre + barra.
  - `gantt-bar.tsx` — barra de progreso con posición/ancho calculados desde fechas.
  - `executive-view-toggle.tsx` — switch cliente para mostrar/ocultar tareas.

- **Frontend — selector de período compartido**: la lógica del `PeriodSelector` existente en `objectives/page.tsx` se debería extraer a un componente reutilizable en `apps/web/src/components/periods/period-selector.tsx` para no duplicar entre la lista y la vista ejecutiva.

- **Frontend — punto de entrada en navegación**: agregar link "Vista Ejecutiva" en sidebar (`app-shell.tsx`) y botón en header de `/objectives` (ver §2).

- **Trabajo futuro diferido**: agregar `id="kr-[id]"` e `id="task-[id]"` a los elementos de la página de detalle, con lógica de `scrollIntoView` + highlight al montar cuando la URL contiene un hash. Requerido para que los links de navegación desde el Gantt (§10) sean funcionales a nivel de sección.

---

## 16. Checklist de aprobación

- [ ] El endpoint `GET /api/v1/okr/objectives/gantt?periodId=` está especificado con su shape de response y casos borde documentados (§13).
- [ ] Los wireframes de estado normal, expandido y vacío están aprobados por el dueño del producto (§3, §4, §5).
- [ ] La lógica de selección de período por defecto (abierto → cerrado más reciente → CTA) está confirmada (§6).
- [ ] El comportamiento del toggle de tareas (client-only, sin re-fetch, default OFF) está confirmado (§7).
- [ ] El algoritmo de posicionamiento de barras (fórmula, mínimo 4px, clipping de fechas fuera de rango) está aprobado (§8).
- [ ] El listado de out-of-scope fue revisado y ningún ítem de la lista requiere ser incluido en esta corrida (§14).
