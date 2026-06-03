# Módulo OKR — Spec funcional inicial

**Módulo**: okr
**Fecha**: 2026-04-20
**Estado**: En revisión

## Contexto

El módulo OKR es el primer módulo funcional de `gestion-publica`. Su objetivo es permitir que una organización estructure sus prioridades trimestrales siguiendo el modelo **Objetivo → Key Result (KR) → Tarea**, donde el avance de ejecución se carga a nivel de Tarea y cascadea hacia arriba según pesos ponderados.

Esta primera iteración cubre la funcionalidad mínima para que un equipo pueda: (a) definir Objetivos para un período trimestral, (b) descomponerlos en KRs con pesos que sumen 100%, (c) descomponer cada KR en Tareas con pesos que sumen 100%, (d) cargar avance sobre las Tareas, y (e) visualizar la cascada de progreso hacia los KRs y el Objetivo. La gestión del módulo se hace desde un backoffice admin; la carga de avance y la visualización de la cascada son accesibles desde la superficie pública de la organización.

En esta iteración los Objetivos **no se ponderan entre sí**: cada Objetivo se visualiza y mide de manera independiente dentro de su período. Tampoco hay alineación vertical entre unidades organizacionales: cada Objetivo pertenece a una única organización y no cascadea con Objetivos de otras unidades.

El módulo arranca con multi-tenant desde el primer día (toda entidad lleva `organizationId`), audit log activo para toda mutación, y soft-delete para Objetivos, KRs y Tareas.

## Actores

| Actor | Descripción |
|---|---|
| Admin de organización | Usuario con permisos de escritura sobre OKR dentro de una organización. Crea, edita y elimina Objetivos, KRs y Tareas. Define pesos. **También puede cargar avance directo sobre Tareas en esta iteración** (ver RN-21); un RBAC más fino se define en la próxima iteración. |
| Usuario de organización (carga de avance) | Usuario con permisos de carga de avance. Opera sobre la superficie pública de la org (requiere autenticación organizacional, ver RN-30). Carga el % de avance de las Tareas que le corresponden y visualiza la cascada hacia arriba. |
| Usuario público lector (autenticado en la organización) | Usuario con permisos solo de lectura sobre los OKR de una organización. Visualiza la cascada sin poder modificarla. En esta iteración requiere autenticación organizacional; la visualización anónima vía URL pública queda fuera de alcance futuro (ver RN-30). |
| Sistema (motor de cascada) | Componente funcional que recalcula el progreso de KRs y Objetivos cada vez que se modifica el avance o el peso de una Tarea, el peso de un KR, o se crea/elimina una Tarea o KR. |

> Nota: "Admin de organización" y "Usuario de organización" son roles funcionales; la resolución concreta de permisos RBAC queda fuera del alcance de esta spec y se define en el módulo `auth`.

## User Stories

- **US-01**: Como Admin de organización, quiero crear un Objetivo asociado a un período (`YYYY-Qn`) dentro de mi organización, para establecer una prioridad trimestral.
- **US-02**: Como Admin de organización, quiero editar el título y la descripción de un Objetivo existente, para corregirlo o enriquecerlo sin perder su historial.
- **US-03**: Como Admin de organización, quiero eliminar (soft-delete) un Objetivo que ya no aplica, para que deje de aparecer en la vista activa sin perder trazabilidad.
- **US-04**: Como Admin de organización, quiero crear Key Results dentro de un Objetivo, asignando un peso en basis points a cada uno, para ponderar su contribución al Objetivo.
- **US-05**: Como Admin de organización, quiero editar un KR (título, descripción, peso), para ajustar su definición o su ponderación.
- **US-06**: Como Admin de organización, quiero eliminar (soft-delete) un KR, para retirarlo del cálculo de la cascada.
- **US-07**: Como Admin de organización, quiero crear Tareas dentro de un KR con un peso en basis points, para descomponer el KR en hitos medibles.
- **US-08**: Como Admin de organización, quiero editar una Tarea (título, descripción, peso), para corregirla o reponderarla.
- **US-09**: Como Admin de organización, quiero eliminar (soft-delete) una Tarea, para retirarla del cálculo del KR.
- **US-10**: Como Admin de organización o como Usuario de organización con permiso de carga, quiero cargar el avance (0–100%) de una Tarea, para que el sistema recalcule el progreso del KR y del Objetivo.
- **US-11**: Como Usuario público lector **autenticado en la organización**, quiero visualizar la cascada de progreso de un Objetivo (progreso del Objetivo, progreso de cada KR, avance de cada Tarea), para entender el estado trimestral sin poder modificarlo. En esta iteración la visualización siempre requiere login de la organización; la publicación anónima (URL de transparencia sin login) queda fuera de alcance futuro.
- **US-12**: Como Usuario de organización, quiero distinguir claramente un KR "sin tareas" de un KR "con tareas al 0%", para entender si el plan está incompleto o sin avances.
- **US-13**: Como Admin de organización, quiero recibir un error explícito si la suma de pesos de los KRs de un Objetivo o de las Tareas de un KR no es 10.000 bps, para no dejar el árbol en un estado inconsistente.
- **US-14**: Como Admin de organización, quiero que los cambios de peso con avances ya cargados no pierdan los avances existentes, pero sí recalculen el progreso del padre, para reflejar correctamente la nueva ponderación.

## Criterios de Aceptación

### US-01 — Crear Objetivo

```gherkin
Feature: Creación de Objetivo
  Scenario: Admin crea un Objetivo válido en el período abierto corriente
    Given que soy Admin de la organización "Org A"
    And existe el período "2026-Q2" como período abierto corriente en "Org A"
    When creo un Objetivo con título "Mejorar atención ciudadana" y período "2026-Q2"
    Then el Objetivo queda persistido asociado a "Org A" y al período "2026-Q2"
    And el progreso del Objetivo es 0%
    And el Objetivo no tiene KRs
    And se registra un evento en el audit log con acción "objective.created"

  Scenario: Creación falla sin título
    Given que soy Admin de la organización "Org A"
    When intento crear un Objetivo sin título
    Then la operación falla con error de validación
    And no se crea nada

  Scenario: Creación falla con período inexistente
    Given que soy Admin de la organización "Org A"
    When intento crear un Objetivo con período "2026-Q9"
    Then la operación falla con error de validación

  Scenario: Creación falla en un período que no es el abierto corriente
    Given que soy Admin de la organización "Org A"
    And "2026-Q2" es el período abierto corriente en "Org A"
    And existe también "2026-Q1" en estado cerrado
    When intento crear un Objetivo con período "2026-Q1"
    Then la operación falla con error "solo se pueden crear Objetivos en el período abierto corriente"

  Scenario: Creación falla en un período futuro aún no iniciado
    Given que soy Admin de la organización "Org A"
    And existe "2026-Q3" en estado futuro (no iniciado)
    When intento crear un Objetivo con período "2026-Q3"
    Then la operación falla con error "solo se pueden crear Objetivos en el período abierto corriente"
```

### US-04 — Crear Key Result con peso

```gherkin
Feature: Creación de Key Result dentro de un Objetivo
  Scenario: Admin crea el primer KR de un Objetivo con peso 10000
    Given un Objetivo "O1" sin KRs en "Org A"
    When creo un KR con título "Reducir tiempo de respuesta" y peso 10000 bps dentro de "O1"
    Then el KR queda asociado a "O1"
    And la suma de pesos de KRs de "O1" es 10000 bps
    And el progreso del KR es 0% (sin tareas)
    And el progreso de "O1" es 0%

  Scenario: Admin agrega un segundo KR y la suma deja de ser 10000
    Given un Objetivo "O1" con un KR "KR1" de peso 10000 bps
    When intento crear un KR "KR2" con peso 4000 bps
    Then la operación falla con error "la suma de pesos de KRs debe ser exactamente 10000 bps"
    And no se crea "KR2"

  Scenario: Admin rebalancea KRs en la misma operación
    Given un Objetivo "O1" con un KR "KR1" de peso 10000 bps
    When en una sola operación bajo "KR1" a 6000 bps y creo "KR2" con peso 4000 bps
    Then la operación es exitosa
    And la suma de pesos de KRs de "O1" es 10000 bps
```

### US-07 — Crear Tarea con peso

```gherkin
Feature: Creación de Tarea dentro de un KR
  Scenario: Admin crea Tarea con peso válido
    Given un KR "KR1" con Tareas cuyos pesos suman 7000 bps
    When creo una Tarea con título "Rediseñar encuesta" y peso 3000 bps dentro de "KR1"
    Then la Tarea queda asociada a "KR1"
    And la suma de pesos de Tareas de "KR1" es 10000 bps
    And el avance de la Tarea es 0 bps

  Scenario: Creación falla si la suma de pesos excede 10000
    Given un KR "KR1" con Tareas cuyos pesos suman 10000 bps
    When intento crear una Tarea con peso 500 bps
    Then la operación falla con error "la suma de pesos de Tareas debe ser exactamente 10000 bps"

  Scenario: Peso 0 es válido si el resto suma 10000
    Given un KR "KR1" con Tareas cuyos pesos suman 10000 bps
    When en una operación creo una Tarea "T-extra" con peso 0 bps
    Then la operación es exitosa
    And la contribución de "T-extra" al KR es nula
```

### US-10 — Cargar avance de Tarea y cascada

```gherkin
Feature: Carga de avance y recálculo de cascada
  Scenario: Admin carga avance y el KR y el Objetivo se recalculan
    Given un Objetivo "O1" con un KR "KR1" (peso 10000 bps) y una Tarea "T1" (peso 10000 bps, avance 0)
    And soy Admin de la organización
    When cargo avance 5000 bps sobre "T1"
    Then el progreso de "T1" es 50%
    And el progreso de "KR1" es 50%
    And el progreso de "O1" es 50%
    And se registra un evento en el audit log con acción "task.progress.updated"

  Scenario: Usuario de organización con permiso de carga actualiza avance
    Given un Objetivo "O1" con un KR "KR1" y una Tarea "T1" (avance 3000 bps)
    And soy Usuario de organización con permiso de carga de avance
    When cargo avance 7000 bps sobre "T1"
    Then el progreso de "T1" es 70%
    And la cascada se recalcula correctamente

  Scenario: Avance fuera de rango es rechazado
    Given una Tarea "T1" existente
    When intento cargar avance de 12000 bps
    Then la operación falla con error de validación
    And el avance de "T1" no cambia

  Scenario: Avance puede disminuir libremente
    Given una Tarea "T1" con avance actual 8000 bps (80%)
    When cargo avance 6000 bps sobre "T1"
    Then el progreso de "T1" es 60%
    And la operación es exitosa
    And la cascada se recalcula con el nuevo valor

  Scenario: Entrada de avance con más de 2 decimales se trunca a 2 decimales
    Given una Tarea "T1"
    When se recibe un valor de avance equivalente a 33,3333%
    Then el sistema trunca a 33,33% y persiste 3333 bps
    And no genera error de precisión

  Scenario: Avance sobre Tarea de KR en Objetivo de período cerrado
    Given un Objetivo "O1" en el período "2025-Q4" que está cerrado
    When intento cargar avance sobre una Tarea de "O1"
    Then la operación falla con error "el período está cerrado"
```

### US-11 — Visualización de cascada (requiere autenticación organizacional)

```gherkin
Feature: Visualización de cascada
  Scenario: Usuario autenticado en la organización ve los tres niveles
    Given un Objetivo "O1" con 2 KRs y 3 Tareas cargadas en "Org A"
    And estoy autenticado como usuario de "Org A" con permiso de lectura
    When visualizo "O1"
    Then veo el progreso del Objetivo en %
    And veo el progreso de cada KR en %
    And veo el avance de cada Tarea en %
    And los KRs sin tareas se muestran con indicador explícito "sin tareas" en lugar de 0%

  Scenario: Usuario no autenticado intenta visualizar cascada
    Given un Objetivo "O1" en "Org A"
    And no estoy autenticado
    When intento acceder a la vista pública de OKR de "Org A"
    Then el sistema me redirige al login
    And no se expone información de "O1" sin sesión válida
```

### US-13 — Validación de suma de pesos

```gherkin
Feature: Validación de suma de pesos
  Scenario: Error claro al guardar KRs que no suman 10000
    Given un Objetivo "O1"
    When intento guardar un conjunto de KRs cuya suma de pesos es 9500 bps
    Then la operación falla
    And el error indica la suma actual (9500) y la esperada (10000)

  Scenario: Error claro al guardar Tareas que no suman 10000
    Given un KR "KR1" con al menos una Tarea
    When intento guardar un conjunto de Tareas cuya suma de pesos es 10500 bps
    Then la operación falla
    And el error indica la suma actual (10500) y la esperada (10000)
```

### US-14 — Recálculo por cambio de peso con avances existentes

```gherkin
Feature: Cambio de pesos con avances existentes
  Scenario: Cambio de peso de Tarea recalcula progreso del KR y del Objetivo
    Given un KR "KR1" con Tareas "T1" (peso 5000, avance 100%) y "T2" (peso 5000, avance 0%)
    And el progreso actual de "KR1" es 50%
    When cambio los pesos a "T1" = 8000 y "T2" = 2000
    Then el avance de "T1" sigue siendo 100%
    And el avance de "T2" sigue siendo 0%
    And el progreso recalculado de "KR1" es 80%
    And el progreso del Objetivo padre se recalcula en consecuencia
    And se registra un evento en el audit log por cada cambio de peso
```

## Casos de Uso Principales

### CU-01: Crear Objetivo completo (Objetivo + KRs + Tareas)

- **Actor principal**: Admin de organización.
- **Precondiciones**:
  - El Admin está autenticado y pertenece a una organización.
  - El módulo OKR está habilitado para la organización.
  - Existe el **período abierto corriente** en la organización. Los Objetivos solo se crean en ese período (RN-24).
- **Flujo principal**:
  1. El Admin crea un Objetivo con título, descripción opcional y organización. El período se asocia automáticamente al período abierto corriente de la organización.
  2. El Admin agrega uno o más KRs al Objetivo, cada uno con título, descripción opcional y peso en bps. No puede superarse el máximo de 10 KRs activos por Objetivo (RN-28).
  3. El sistema valida al guardar la colección de KRs que la suma de pesos = 10.000 bps.
  4. El Admin agrega una o más Tareas a cada KR, cada una con título, descripción opcional y peso en bps. No puede superarse el máximo de 20 Tareas activas por KR (RN-28).
  5. El sistema valida al guardar la colección de Tareas de cada KR que la suma de pesos = 10.000 bps.
  6. El sistema registra eventos de audit por cada entidad creada.
  7. El Objetivo queda en estado "activo", progreso 0%, listo para carga de avance.
- **Flujo alternativo**:
  - 1a. El Admin intenta crear el Objetivo en un período distinto del abierto corriente (pasado, cerrado o futuro) → error explícito, no se persiste.
  - 3a. Suma de pesos de KRs ≠ 10.000 → error explícito, no se persiste el estado inválido.
  - 5a. Suma de pesos de Tareas ≠ 10.000 → error explícito, no se persiste el estado inválido.
  - 2a/4a. Intento de superar los límites de 10 KRs o 20 Tareas activas → error explícito con el límite superado.
  - El Admin puede guardar el Objetivo sin KRs (estado intermedio válido: progreso 0%, "sin KRs").
  - El Admin puede guardar un KR sin Tareas (estado intermedio válido: progreso 0%, "sin Tareas").
- **Postcondiciones**:
  - Árbol Objetivo → KRs → Tareas persistido y consistente.
  - Audit log contiene los eventos de creación.

### CU-02: Carga de avance de Tarea y recálculo de cascada

- **Actor principal**: Usuario de organización con permiso de carga de avance.
- **Precondiciones**:
  - La Tarea existe, no está soft-deleted, y pertenece a un Objetivo de un período abierto.
  - El usuario pertenece a la misma organización del Objetivo.
- **Flujo principal**:
  1. El usuario abre la vista de carga de avance para una Tarea.
  2. El usuario ingresa un valor de avance en % (UI) que se traduce a basis points (0–10.000).
  3. El sistema valida rango.
  4. El sistema persiste el nuevo avance.
  5. El sistema recalcula el progreso del KR padre y del Objetivo padre en la misma operación lógica.
  6. El sistema registra un evento de audit con el avance anterior, el nuevo y el actor.
  7. El usuario ve el árbol actualizado.
- **Flujo alternativo**:
  - 3a. Avance fuera de rango → error de validación, nada se persiste.
  - 1a. El período del Objetivo está cerrado → la UI deshabilita la carga; el backend rechaza con error "período cerrado".
  - 1b. La Tarea está soft-deleted → la UI no la ofrece; el backend rechaza.
- **Postcondiciones**:
  - Avance de la Tarea actualizado.
  - Progreso del KR y del Objetivo recalculados.
  - Evento de audit registrado.

### CU-03: Rebalanceo de pesos de KRs o Tareas

- **Actor principal**: Admin de organización.
- **Precondiciones**:
  - Existe el Objetivo/KR y el Admin pertenece a su organización.
  - El período del Objetivo está abierto (un período cerrado no admite mutaciones por RN-14; la reapertura está fuera de alcance de esta iteración, ver "Fuera de alcance de esta iteración").
- **Flujo principal**:
  1. El Admin abre la vista de edición de pesos del Objetivo (o del KR).
  2. Ajusta los pesos de los KRs (o Tareas) de manera que la suma sea 10.000 bps.
  3. Envía la operación como una sola transacción lógica.
  4. El sistema valida la suma.
  5. El sistema persiste los nuevos pesos. Los avances existentes de las Tareas **no se modifican**.
  6. El sistema recalcula el progreso de los KRs y del Objetivo afectados.
  7. El sistema registra un evento de audit por cada cambio de peso.
- **Flujo alternativo**:
  - 4a. Suma ≠ 10.000 → error explícito con suma actual y esperada.
- **Postcondiciones**:
  - Pesos actualizados.
  - Avances de Tareas preservados.
  - Progreso recalculado.
  - Audit log con los cambios.

### CU-04: Soft-delete de entidades

- **Actor principal**: Admin de organización.
- **Precondiciones**:
  - La entidad existe y el Admin pertenece a su organización.
  - El período del Objetivo está abierto (un período cerrado no admite mutaciones, RN-14).
- **Flujo principal**:
  1. El Admin selecciona "eliminar" sobre un Objetivo, KR o Tarea.
  2. **Validación previa de invariante de suma (RN-25)**:
     - Si la entidad es un **Objetivo**, el borrado se acepta sin chequeo adicional de suma (el Objetivo se retira completo y la suma deja de aplicarse).
     - Si la entidad es un **KR**, el sistema verifica que la suma de pesos de los KRs activos restantes sería exactamente 10.000 bps. Si no, la operación se bloquea.
     - Si la entidad es una **Tarea**, el sistema verifica que la suma de pesos de las Tareas activas restantes de su KR sería exactamente 10.000 bps. Si no, la operación se bloquea.
  3. Si pasa la validación: el sistema marca la entidad como soft-deleted (`deleted_at` no nulo — detalle técnico fuera de spec).
  4. La entidad deja de participar en la cascada activa y deja de aparecer en las vistas por defecto.
  5. El sistema recalcula el progreso del padre (si corresponde).
  6. El sistema registra un evento de audit con acción de eliminación.
- **Flujo alternativo**:
  - 2a. La eliminación de un KR o Tarea dejaría la suma de pesos restantes ≠ 10.000 bps → **la operación se bloquea** con error explícito que indica la suma resultante y la esperada. El Admin debe **rebalancear** primero los pesos (CU-03) y volver a intentar el borrado.
  - La restauración de entidades soft-deleted está fuera de alcance de esta iteración (ver "Fuera de alcance de esta iteración"). Si el Admin necesita recuperar una entidad eliminada, debe recrearla manualmente.
- **Postcondiciones**:
  - La entidad no aparece en vistas por defecto.
  - Se mantiene la trazabilidad en el audit log.
  - La suma de pesos del padre permanece en 10.000 bps (o el padre queda sin hijos activos, que es un estado válido con flag "plan incompleto").

### CU-05: Visualización pública de la cascada (requiere autenticación organizacional)

- **Actor principal**: Usuario público lector autenticado en la organización.
- **Precondiciones**:
  - El usuario está **autenticado** y pertenece (o tiene acceso de lectura) a la organización dueña del Objetivo (RN-30).
  - El usuario tiene permiso de lectura sobre el Objetivo.
- **Flujo principal**:
  1. El usuario inicia sesión en la superficie pública de la organización.
  2. El usuario ingresa a la vista pública de OKR de la organización.
  3. El sistema lista los Objetivos activos del período seleccionado (default: período abierto actual).
  4. Para cada Objetivo muestra su progreso, sus KRs con sus progresos, y las Tareas con sus avances.
  5. KRs sin Tareas se muestran con indicador explícito "sin tareas".
  6. Objetivos sin KRs se muestran con indicador explícito "sin KRs".
- **Flujo alternativo**:
  - 1a. El usuario no está autenticado o su sesión expiró → el sistema lo redirige al login; no se expone información antes de autenticar.
  - 1b. El usuario autenticado no pertenece a la organización consultada → acceso rechazado (como si la entidad no existiera, alineado con edge case 9).
- **Postcondiciones**:
  - Visualización consistente con el estado actual; no hay mutación.
- **Nota**: La publicación anónima vía URL pública (sin login, estilo "portal de transparencia") **queda fuera de alcance futuro** y no se implementa en esta iteración.

## Edge Cases

| # | Situación | Comportamiento esperado |
|---|---|---|
| 1 | Objetivo sin KRs | Progreso del Objetivo = 0%. No es error. La UI lo marca con indicador "sin KRs" para distinguirlo de un Objetivo con KRs al 0%. |
| 2 | KR sin Tareas | Progreso del KR = 0%. No es error. La UI lo marca con indicador "sin Tareas" para distinguirlo de un KR con Tareas todas al 0%. |
| 3 | Suma de pesos de KRs ≠ 10.000 bps | La operación de guardado es rechazada con error explícito que incluye la suma actual y la esperada (10.000). Nada se persiste. |
| 4 | Suma de pesos de Tareas ≠ 10.000 bps | Idem anterior a nivel KR. Operación rechazada. |
| 5 | Peso negativo o > 10.000 bps | Rechazado por validación a nivel de campo, antes de chequear la suma. Error de validación explícito. |
| 6 | Tarea con peso 0 | Permitido si el resto suma 10.000 bps. Contribución nula al KR. No es error. |
| 7 | Período cerrado / no corriente | No se permite: cargar avance, editar pesos de KRs o Tareas, crear/editar/eliminar Objetivos/KRs/Tareas. La lectura y la clonación a otro período sí están permitidas. **Creación de Objetivos**: solo en el período **abierto corriente** de la organización (RN-24). Se bloquea crear Objetivos tanto en períodos pasados/cerrados como en períodos futuros no iniciados, incluso si el período existe en el sistema. La reapertura de períodos cerrados está **fuera de alcance de esta iteración**. |
| 8 | Soft-deleted en cascada | Las entidades soft-deleted no participan en la cascada ni cuentan para la suma de 10.000 bps. No aparecen en la vista por defecto. **Si el soft-delete de un KR o una Tarea dejaría la suma de pesos de sus hermanos activos ≠ 10.000 bps, la operación se bloquea con error explícito y el Admin debe rebalancear primero** (RN-25, CU-04). La **restauración** de entidades soft-deleted queda **fuera de alcance de esta iteración**; el Admin puede recrear manualmente. El audit log mantiene todas las referencias, incluidas las de entidades eliminadas. |
| 9 | Admin de organización A intenta tocar entidades de organización B | La operación es rechazada como si la entidad no existiera (sin filtración de información). Todo acceso filtra por `organizationId` del contexto. |
| 10 | Precisión decimal en avance (ej: 33,33% → 3333 bps) | La unidad mínima de avance es 1 bps (0,01%). Un valor como 33,3333% se **trunca** a 2 decimales en la entrada (33,33% → 3333 bps), sin emitir error de precisión (RN-22). La conversión a % con 2 decimales se hace solo al presentar. El cálculo de cascada se hace siempre en bps enteros, redondeando solo al render. Cualquier redondeo intermedio queda prohibido para no acumular error. |
| 11 | Concurrencia: dos admins editando pesos del mismo Objetivo | Política **"último guardado gana"** siempre que la suma sea válida (RN-27). La operación valida la suma completa de los KRs antes de persistir. Si el segundo guardado encuentra que el primero ya cambió otros pesos y, con ese nuevo estado, su propuesta no mantiene la invariante de 10.000 bps, recibe un **error 409 de conflicto** y debe recargar la vista para rehacer sus cambios sobre el estado actual. En MVP no hay aviso proactivo en vivo de "otro admin está editando". |
| 12 | Concurrencia: dos usuarios cargando avance de Tareas distintas del mismo KR | Ambas operaciones deben tener éxito. El progreso del KR refleja ambos avances al final. No debe haber pérdida de escrituras. |
| 13 | Cambio de pesos con avances ya cargados | Los avances de Tareas no se modifican. El progreso del KR y del Objetivo se recalcula con los nuevos pesos. No se "pierde historial" de avance. El audit log guarda el cambio de peso. |
| 14 | Usuario sin organización asignada | No puede acceder a ninguna entidad OKR. La UI lo redirige o muestra estado "sin organización". |
| 15 | KR o Tarea eliminada tras haber contribuido al progreso histórico | El audit log preserva los eventos de avance y de eliminación. La vista actual no la muestra; el progreso actual no la computa. |

## Reglas de Negocio

- **RN-01**: Todo Objetivo pertenece a **exactamente una** organización y a **exactamente un** período.
- **RN-02**: Todo KR pertenece a **exactamente un** Objetivo. Toda Tarea pertenece a **exactamente un** KR. No existen "Tareas libres" ni "KRs libres".
- **RN-03**: Los pesos se expresan en basis points: enteros en el rango [0, 10.000]. No se admiten floats ni valores fuera de rango.
- **RN-04**: La suma de pesos de todos los KRs **activos** (no soft-deleted) de un Objetivo debe ser exactamente 10.000 bps. Validado en el backend antes de persistir cambios.
- **RN-05**: La suma de pesos de todas las Tareas **activas** (no soft-deleted) de un KR debe ser exactamente 10.000 bps. Validado en el backend antes de persistir cambios.
- **RN-06**: El avance de una Tarea se expresa en basis points: entero en el rango [0, 10.000]. Es el **único input directo** de progreso en todo el sistema.
- **RN-07**: El progreso de un KR se calcula como `Σ(avance_tarea_i × peso_tarea_i) / 10.000`, sobre las Tareas activas. Un KR sin Tareas activas tiene progreso 0 bps.
- **RN-08**: El progreso de un Objetivo se calcula como `Σ(progreso_kr_j × peso_kr_j) / 10.000`, sobre los KRs activos. Un Objetivo sin KRs activos tiene progreso 0 bps.
- **RN-09**: El progreso no es editable directamente a nivel KR ni a nivel Objetivo. No existe endpoint ni UI para "fijar" el progreso de un KR.
- **RN-10**: Los KR que representan métricas (ej: "llegar a 10.000 usuarios") se modelan creando Tareas-hito con sus pesos. No hay flag especial "KR métrica" en esta iteración.
- **RN-11**: Los Objetivos no se ponderan entre sí en esta iteración. Cada Objetivo se visualiza y mide de manera independiente dentro de su período.
- **RN-12**: No hay alineación vertical entre unidades organizacionales. No hay cascada entre Objetivos de distintas organizaciones.
- **RN-13**: Objetivos, KRs y Tareas usan soft-delete. Nunca se borran físicamente por vía funcional.
- **RN-14**: Un período cerrado no admite ninguna mutación sobre sus Objetivos/KRs/Tareas (avance, pesos, creación, edición, eliminación). Sí admite lectura y clonación a otro período.
- **RN-15**: Clonar un Objetivo a otro período es una acción explícita y manual del usuario. No hay duplicación automática entre períodos.
- **RN-16**: Toda mutación (crear, editar, eliminar, cambiar peso, cargar avance) registra un evento en el audit log. El audit log es append-only; las correcciones se hacen con eventos compensatorios.
- **RN-17**: Toda query de negocio filtra por `organizationId` del contexto del usuario. Los usuarios sin organización asignada no pueden acceder a ninguna entidad OKR.
- **RN-18**: El redondeo de valores a porcentaje con decimales se hace **solo** en la capa de presentación. El cálculo de cascada opera en basis points enteros y no redondea en pasos intermedios.
- **RN-19**: Cambiar pesos con avances cargados no modifica los avances de las Tareas; sí recalcula el progreso del KR y del Objetivo.
- **RN-20**: El período se expresa con el formato `YYYY-Qn`, con `n ∈ {1, 2, 3, 4}`. El período pertenece a una organización.
- **RN-21**: En esta iteración, tanto el **Admin de organización** como el **Usuario de organización con permiso de carga** pueden registrar avance sobre Tareas. Un RBAC más fino que separe ambas capacidades se define en la próxima iteración.
- **RN-22**: El avance ingresado sobre una Tarea se expresa con **hasta 2 decimales** (precisión de bps). Cualquier valor con mayor precisión recibido por el backend se **trunca** a 2 decimales antes de convertir a bps; no se emite error de precisión. La UI debe limitar la entrada a 2 decimales por diseño, de modo que el truncamiento sea una salvaguarda y no un camino habitual.
- **RN-23**: *(reservada)* La **reapertura de períodos cerrados** está fuera de alcance de esta iteración. Un período cerrado permanece cerrado para todo efecto de mutación.
- **RN-24**: La **creación de Objetivos** solo se permite en el **período abierto corriente** de la organización. Quedan explícitamente bloqueados: períodos pasados (aunque estén marcados como abiertos) y períodos futuros aún no iniciados.
- **RN-25**: El **soft-delete de un KR o de una Tarea** se **bloquea** si la suma de pesos de sus hermanos activos restantes resultaría distinta de 10.000 bps. El Admin debe rebalancear primero los pesos y luego ejecutar el borrado. El soft-delete de un Objetivo no está sujeto a esta validación (se retira el árbol completo).
- **RN-26**: *(reservada)* La **restauración** de entidades soft-deleted está fuera de alcance de esta iteración. Para recuperar una entidad eliminada, el Admin debe recrearla manualmente.
- **RN-27**: Ante **edición concurrente de pesos** por dos Admins, rige "último guardado gana" siempre que la invariante de suma = 10.000 bps se mantenga. Si el segundo guardado no puede cumplir la invariante sobre el estado ya modificado por el primero, recibe un **conflicto (HTTP 409)** y debe recargar. No hay aviso proactivo en vivo en MVP.
- **RN-28**: **Límites máximos** de estructura (validados en backend, sobre entidades **activas** — no soft-deleted): **hasta 10 KRs** por Objetivo y **hasta 20 Tareas** por KR. Intentos de superar estos límites son rechazados con error explícito.
- **RN-29**: El avance de una Tarea **puede disminuir libremente**: no es monotónicamente creciente. Cargar un valor menor al anterior es una operación válida (registrada en audit log como cualquier cambio de avance).
- **RN-30**: La **visualización "pública" de OKR** de una organización requiere, en esta iteración, **autenticación organizacional** (usuario logueado de la organización con permiso de lectura). "Público" significa aquí "accesible desde la superficie pública de la organización para sus usuarios autenticados", no "accesible sin login". La publicación anónima vía URL sin sesión queda fuera de alcance futuro.
- **RN-31**: Un Objetivo **sin KRs activos**, o un KR **sin Tareas activas**, al cierre del período se reporta con **progreso 0%** y un indicador de **"plan incompleto"**. No hay bloqueo ni reporting especial adicional en esta iteración.

## Supuestos

- **S-01**: Existe previamente en el sistema una entidad "Organización" y una entidad "Período" gestionadas por el módulo `core`. Esta spec asume que un Admin puede seleccionar un Período abierto existente al crear un Objetivo.
- **S-02**: El ciclo de vida del Período (abierto → cerrado) se gestiona fuera del módulo OKR. Esta spec asume disponibilidad de un flag o estado de apertura consultable.
- **S-03**: La resolución de permisos (quién es "Admin", quién puede "cargar avance") se define en el módulo `auth` / RBAC. Esta spec asume que los permisos relevantes existen y se aplican antes de invocar la lógica OKR.
- **S-04**: La habilitación del módulo OKR por organización (`module enablement`) se gestiona en el módulo `core`. Un Objetivo no puede crearse en una organización que no tenga OKR habilitado.
- **S-05**: La superficie pública de la organización muestra los Objetivos del período abierto por default; el selector de períodos está disponible para ver períodos anteriores.
- **S-06**: El locale es `es-AR`. Porcentajes se presentan con coma decimal (ej: `82,00%`).
- **S-07**: Las fechas de apertura/cierre de Período, si las hay, se alinean al calendario local (`America/Argentina/Buenos_Aires`). Q2 2026 = abril–junio local.

## A resolver con el dueño del producto

— (Todas las preguntas abiertas AR-01 a AR-12 de la iteración MVP fueron resueltas por el dueño del producto el 2026-04-20. Ver secciones "Reglas de Negocio", "Fuera de alcance de esta iteración" y "Fuera de alcance futuro" para el destino de cada decisión; ver también "Control de cambios".)

---

## Fuera de alcance de esta iteración

Estas capacidades fueron evaluadas y quedan **explícitamente fuera del MVP**. No son "pendientes": son decisiones conscientes de no construirlas ahora.

- **Reapertura de períodos cerrados** (ex-AR-03): no se ofrece ningún mecanismo para reabrir un período cerrado. Una vez cerrado, permanece cerrado para todo efecto de mutación.
- **Restauración de entidades soft-deleted** (ex-AR-06): no hay vista ni acción de "restaurar" Objetivos, KRs o Tareas eliminadas. Si el Admin necesita recuperar una entidad eliminada, la recrea manualmente. El audit log preserva la trazabilidad del borrado.
- **Aviso proactivo en vivo de edición concurrente** (ex-AR-07, complementa RN-27): no se implementa notificación en vivo de "otro admin está editando este Objetivo". La política es "último guardado gana" con detección reactiva de conflicto (HTTP 409) cuando la invariante de suma no puede cumplirse.
- **RBAC fino entre "Admin" y "Usuario con carga"** para la carga de avance (complemento de RN-21): en esta iteración ambos roles pueden cargar avance sobre Tareas. La separación más granular se define en una próxima iteración.
- **Reporting especial de "plan incompleto"** (ex-AR-11, complemento de RN-31): más allá del flag y del progreso 0%, no hay reportes agregados ni exportables sobre Objetivos/KRs con plan incompleto al cierre.

## Fuera de alcance futuro

Capacidades previstas a futuro pero no comprometidas con fecha ni iteración específica. Se listan para explicitar que **son revisables** y que la decisión actual no las cierra para siempre.

- **Visualización anónima vía URL pública** (ex-AR-12, complemento de RN-30): portal de transparencia sin login que exponga Objetivos/KRs/Tareas de la organización. En esta iteración la visualización requiere autenticación organizacional.
- **Independencia entre Objetivos del mismo período** (ex-AR-10, complemento de RN-11): la decisión de no ponderar Objetivos entre sí es de esta iteración y **revisable** más adelante. No se introduce ponderación inter-objetivos ahora, pero podría incorporarse si el dueño del producto lo define.
- **Jerarquía / alineación vertical entre unidades organizacionales** (reafirmado por RN-12): fuera de alcance, como ya establece `CLAUDE.md`.
- **Tipos especiales de KR** ("métrica", "binario", etc.), checklists dentro de Tareas, asignación de responsables, dependencias, fechas de vencimiento por Tarea, comentarios, notificaciones, etiquetas: enumerados en Notas de implementación, no se implementan en MVP.

## Notas de implementación para el equipo técnico

> Estas notas son aclaraciones funcionales. No definen tecnologías ni arquitectura.

- **Recálculo atómico**: al modificar avance de una Tarea, peso de una Tarea, peso de un KR, o al crear/soft-deletar una Tarea o KR, el progreso del KR padre y del Objetivo padre deben quedar consistentes con los datos al cierre de la operación. El usuario no debería observar un estado intermedio donde el hijo ya cambió pero el padre aún no refleja el cambio.
- **Validación al guardar, no al editar**: mientras el Admin está editando pesos en una vista multi-campo, la suma intermedia puede no ser 10.000. La validación estricta corre al enviar la operación completa. La UI puede (y debería) mostrar una alerta visual de "la suma actual es X de 10.000" en vivo, pero no debe bloquear la edición campo a campo.
- **Distinción de "0% sin hijos" vs "0% con hijos"**: crítico para la UX. Reflejar esta distinción en la respuesta del backend (ej: un flag explícito o dos campos separados), no dejarla solo a inferencia del frontend. En el cierre de período, además, esta distinción debe poder reflejarse como un **flag de "plan incompleto"** (RN-31): un Objetivo sin KRs activos o un KR sin Tareas activas al cierre se reporta con progreso 0% **y** el flag, sin bloqueo ni reporting adicional.
- **Soft-delete en cascada**: al soft-deletar un Objetivo, sus KRs y Tareas asociados quedan implícitamente fuera de la vista por defecto sin necesidad de marcarse individualmente. Al consultar, se filtra por la raíz; los descendientes "cuelgan" del estado de la raíz. Esto es una expectativa funcional; la implementación concreta queda a criterio del equipo técnico siempre que preserve la trazabilidad del audit log.
- **Bloqueo de soft-delete por invariante de suma**: ver RN-25 y CU-04. Antes de persistir el soft-delete de un KR o Tarea, el backend debe proyectar la suma de pesos resultante de los hermanos activos y rechazar la operación si no es exactamente 10.000 bps, retornando un error explícito con la suma proyectada y la esperada. El Admin rebalancea primero (CU-03) y reintenta el borrado.
- **Concurrencia de pesos (RN-27)**: la detección de conflicto se resuelve al intentar persistir — si el estado actual del servidor hace que la nueva propuesta viole la invariante de suma = 10.000 bps, responder **HTTP 409 Conflict** con información suficiente para que la UI invite al usuario a recargar. No se requiere mecanismo de "lock optimista por versión" en vivo; basta con revalidar la invariante en el commit. No se implementa aviso proactivo en vivo en MVP.
- **Entrada del usuario en UI**: se recomienda aceptar porcentajes con 2 decimales (ej: `82,50`) y convertir a bps en el borde (82,50 → 8250 bps). La validación del rango [0, 10.000 bps] se aplica después de la conversión.
- **Truncado de precisión (RN-22)**: si por cualquier motivo el backend recibe un valor de avance con más de 2 decimales (ej: `33,3333%`), debe **truncar** a 2 decimales al convertir a bps (`33,3333%` → 3333 bps), sin emitir error. La UI debe limitar la entrada a 2 decimales por diseño; el truncamiento es una salvaguarda, no un camino habitual.
- **Período abierto corriente (RN-24)**: la creación de Objetivos se valida contra el período abierto corriente de la organización al momento de la operación. El backend resuelve qué período es "corriente" (no lo elige el usuario); la UI debería tampoco ofrecer selector de período al crear Objetivo en MVP, para alinearse con esta regla.
- **Límites 10/20 (RN-28)**: los límites de 10 KRs activos por Objetivo y 20 Tareas activas por KR se miden sobre entidades **no soft-deleted**. Las entidades soft-deleted no cuentan para el límite. Los límites se validan en el backend (no solo en UI) al crear/restaurar (si aplicara en el futuro).
- **Monotonicidad del avance (RN-29)**: el backend no debe rechazar una carga de avance menor que el valor anterior. Toda transición (ascendente, descendente, mismo valor) genera un evento de audit.
- **Alcance de "público" (RN-30)**: a pesar del nombre del route group `(public)` de la aplicación web, la visualización de OKR en esta iteración **requiere login organizacional**. "Público" refiere a la superficie pública de la organización para sus usuarios autenticados, no a acceso anónimo. Cualquier acceso sin sesión se redirige a login.
- **Audit log y diff**: para cambios de peso o avance, el evento de audit debe permitir reconstruir el valor anterior y el valor nuevo. El diseño concreto del formato del diff queda al equipo técnico.
- **Clonación a período**: fuera del alcance de esta spec como feature terminada, pero referenciada en la RN-15. Cuando se especifique, deberá preservar títulos, descripciones, estructura y pesos, pero resetear avances a 0.
- **Fuera de alcance de esta iteración** (no implementar, más allá de lo listado en las secciones dedicadas): notificaciones, comentarios, asignación de responsables a Tareas, dependencias entre Tareas, alineación vertical entre unidades organizacionales, tipos especiales de KR ("métrica", "binario", etc.), checklists dentro de Tareas, fechas de vencimiento por Tarea, etiquetas/tags.

## Anexo: Ejemplos de cascada con números

Todos los cálculos se hacen en basis points enteros. La conversión a porcentaje con 2 decimales se hace **solo en la capa de presentación**.

### Ejemplo 1 — Cascada simple

Objetivo **"Mejorar atención ciudadana"**, período `2026-Q2`, con 2 KRs.

- **KR1** "Reducir tiempo de respuesta" — peso **6000 bps** (60,00%).
  - Tarea 1.1 "Contratar 2 agentes más" — peso **4000 bps**, avance **10000 bps** (100,00%).
  - Tarea 1.2 "Implementar nuevo script de triage" — peso **6000 bps**, avance **5000 bps** (50,00%).
- **KR2** "Subir satisfacción en encuestas" — peso **4000 bps** (40,00%).
  - Tarea 2.1 "Rediseñar encuesta" — peso **10000 bps**, avance **10000 bps** (100,00%).

**Paso 1 — validación de sumas**:
- Suma de pesos de KRs del Objetivo: `6000 + 4000 = 10000` → válido.
- Suma de pesos de Tareas del KR1: `4000 + 6000 = 10000` → válido.
- Suma de pesos de Tareas del KR2: `10000` → válido.

**Paso 2 — progreso de KR1**:

```
progressKR1 = (avance_T1.1 × peso_T1.1 + avance_T1.2 × peso_T1.2) / 10000
            = (10000 × 4000 + 5000 × 6000) / 10000
            = (40.000.000 + 30.000.000) / 10000
            = 70.000.000 / 10000
            = 7000 bps
```

Presentación: **70,00%**.

**Paso 3 — progreso de KR2**:

```
progressKR2 = (10000 × 10000) / 10000
            = 100.000.000 / 10000
            = 10000 bps
```

Presentación: **100,00%**.

**Paso 4 — progreso del Objetivo**:

```
progressObjetivo = (progressKR1 × pesoKR1 + progressKR2 × pesoKR2) / 10000
                 = (7000 × 6000 + 10000 × 4000) / 10000
                 = (42.000.000 + 40.000.000) / 10000
                 = 82.000.000 / 10000
                 = 8200 bps
```

Presentación: **82,00%**.

### Ejemplo 2 — Un KR sin tareas y otro KR desbalanceado internamente

Objetivo con 2 KRs, período `2026-Q2`.

- **KR-A** "Ampliar canales de contacto" — peso **3000 bps** (30,00%).
  - (sin Tareas)
- **KR-B** "Reducir reclamos duplicados" — peso **7000 bps** (70,00%).
  - Tarea B.1 "Deduplicar base de contactos" — peso **2500 bps**, avance **10000 bps** (100,00%).
  - Tarea B.2 "Capacitación a agentes" — peso **2500 bps**, avance **0 bps** (0,00%).
  - Tarea B.3 "Automatizar detección de duplicados" — peso **5000 bps**, avance **4000 bps** (40,00%).

**Paso 1 — validación de sumas**:
- Suma de pesos de KRs del Objetivo: `3000 + 7000 = 10000` → válido.
- Suma de pesos de Tareas del KR-A: N/A (sin tareas).
- Suma de pesos de Tareas del KR-B: `2500 + 2500 + 5000 = 10000` → válido.

**Paso 2 — progreso de KR-A**:

Sin Tareas activas ⇒ por RN-07, progreso = **0 bps** (0,00%). La UI lo presenta con indicador "sin tareas" para distinguirlo de "todas las tareas al 0%".

**Paso 3 — progreso de KR-B**:

```
progressKR-B = (10000 × 2500 + 0 × 2500 + 4000 × 5000) / 10000
             = (25.000.000 + 0 + 20.000.000) / 10000
             = 45.000.000 / 10000
             = 4500 bps
```

Presentación: **45,00%**.

**Paso 4 — progreso del Objetivo**:

```
progressObjetivo = (progressKR-A × pesoKR-A + progressKR-B × pesoKR-B) / 10000
                 = (0 × 3000 + 4500 × 7000) / 10000
                 = (0 + 31.500.000) / 10000
                 = 31.500.000 / 10000
                 = 3150 bps
```

Presentación: **31,50%**.

Observación de UX: aunque el Objetivo muestra 31,50%, el KR-A sin Tareas es un plan incompleto. La vista debería alertar al Admin que el 30% de la ponderación del Objetivo está sobre un KR sin Tareas.

---

## Control de cambios

| Fecha | Autor | Cambio |
|---|---|---|
| 2026-04-20 | Dueño del producto | Resolución de 12 preguntas abiertas (AR-01 a AR-12) de la iteración MVP. Derivaron en nuevas reglas RN-21 a RN-31 y en la apertura de las secciones "Fuera de alcance de esta iteración" y "Fuera de alcance futuro". Estado cambia de `Borrador` a `En revisión`. Resumen del destino de cada decisión: AR-01 → RN-21 (y ajuste de Actores, US-10, CU-02); AR-02 → RN-22 + Notas de implementación; AR-03 → Fuera de alcance de esta iteración (RN-23 reservada); AR-04 → RN-24 (y ajuste CU-01, edge case 7, CA de US-01); AR-05 → RN-25 (y ajuste CU-04, edge case 8); AR-06 → Fuera de alcance de esta iteración (RN-26 reservada); AR-07 → RN-27 (y ajuste edge case 11); AR-08 → RN-28 (y ajuste CU-01); AR-09 → RN-29 (y CA en US-10); AR-10 → Fuera de alcance futuro (revisable); AR-11 → RN-31 + Notas de implementación; AR-12 → RN-30 (y ajuste US-11, CU-05, Actores). |
