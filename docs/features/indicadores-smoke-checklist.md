# Smoke checklist — eje Indicadores (M1 + M2)

Verificación manual end-to-end para correr **post-deploy**, a mano. Orden por
prioridad: el **Caso 1** (flujo M2 completo) es el que no se probó todavía en
ningún lado y va primero.

Precondiciones:
- Deploy con las migraciones aplicadas (`prisma migrate deploy`).
- Seed de demo corrido (`pnpm --filter api prisma:seed`) — opcional pero
  recomendado; deja la org `demo` con datos listos (KR automático a 40%,
  objetivo a 50%). Varios casos se pueden verificar directamente sobre el seed.
- Un usuario **superadmin** para gestionar módulos/períodos.

Convención: ✅ = pasa, ❌ = falla (anotar qué y dónde).

---

## Caso 1 — Flujo end-to-end M2 (prioridad máxima)

El camino que aún no se ejercitó completo en ningún entorno.

1. Como superadmin, habilitar en una org los módulos **indicadores-gestion** y
   luego **indicadores-okr** (Configuración → Módulos).
2. Verificar que en el nav aparece **Indicadores de gestión**.
3. Crear un **indicador** (ej. creciente, mensual, %, baseline 0, target 100).
4. Crear un **objetivo** en el período abierto.
5. En el alta del KR, elegir **Modo de progreso = Automático**, seleccionar el
   indicador, dejar baseline prellenado (último valor), poner target y guardar.
   → El KR aparece con badge **⚡ Automático**.
6. Con el indicador **sin cargas**, el KR debe mostrarse en **0%** con badge
   **"sin datos"** (RN-O6).
7. Cargar un **MetricEntry** en el detalle del indicador (bucket válido).
8. Volver al objetivo → el KR automático **actualizó su %** (interpolación
   baseline→target al valor acumulado).
9. Verificar que el **objetivo recalculó su progreso en cascada** (el % del
   objetivo refleja el nuevo % del KR según su peso).
10. Cargar una segunda entry → el % del KR y del objetivo vuelven a moverse.

> Atajo con seed: la org `demo` ya tiene el objetivo "Mejorar la empleabilidad
> juvenil" con el KR automático a 40% y el objetivo a 50%. Cargar una entry
> nueva en "Tasa de desempleo juvenil" y verificar que ambos se mueven.

---

## Caso 2 — Feature flags y guards

1. Habilitar / deshabilitar cada módulo por org y ver el efecto inmediato en el nav.
2. **Dependencia**: intentar habilitar **indicadores-okr** sin **indicadores-gestion**
   → **409**. Intentar deshabilitar **indicadores-gestion** con **indicadores-okr**
   activo → **409**.
3. Con el módulo **deshabilitado**, los endpoints/pantallas del módulo no son
   accesibles (nav oculto; acceso directo por URL denegado).
4. **Regresión del bug de guards**: un **superadmin** entra sin problema a las
   pantallas/acciones protegidas por `SuperadminOnlyGuard` (no debe recibir
   `SuperadminRequired`). Ver la nota de guards en CLAUDE.md.

---

## Caso 3 — Módulo 1 ABM y curva

1. Crear indicador; editar nombre/baseline/target → OK.
2. En edición, **unit / frecuencia / dirección son inmutables** (no editables).
3. Carga **normal** (bucket actual) y **retroactiva** (bucket anterior) → ambas OK.
4. La **curva esperada vs. real** se dibuja correctamente.
5. Bordes de la curva:
   - Indicador **sin datos** → curva esperada dibujada, real vacía.
   - **Una sola carga** → real con un punto.
   - Indicador **decreciente que se pasa del target** → progreso clamp a 100%.

---

## Caso 4 — KR automático (detalle de objetivo)

1. El KR automático muestra barra **sin slider** (no editable a mano).
2. Sus **tareas** siguen operativas (slider funciona) pero marcadas como
   **informativas — no impactan el avance** (RN-O4).
3. Badge **"sin datos"** cuando el indicador vinculado no tiene entries.
4. **Editar vínculo** (baseline/target/dirección) desde el kebab → recálculo
   inmediato del KR y del objetivo.
5. **Desvincular** desde el kebab → confirmación que explica que el KR vuelve a
   **manual conservando el último %**; tras confirmar, el KR queda manual con ese %.
6. Un KR **manual** en el mismo objetivo no cambia en nada.
7. Bloque **"Indicadores de contexto"**: lista read-only (frecuencia, último
   valor, dirección, target), marcado como **sin impacto en el cálculo**;
   agregar/quitar desde sus dialogs.

---

## Caso 5 — Período cerrado (read-only)

1. Cerrar el período de la org.
2. En el detalle del indicador: **carga deshabilitada**.
3. En el objetivo: vínculo y contexto **congelados** (sin acciones de vincular/
   editar/desvincular ni agregar/quitar contexto); el % del KR automático queda
   fijo al último valor.

---

## Caso 6 — Papelera / soft-delete y permisos

1. Eliminar un indicador con vínculos activos → **bloqueado (409)**: primero
   desvincular (RN-O7).
2. Soft-delete de un indicador **sin vínculos** → va a papelera; restaurar OK.
3. Permisos por rol:
   - `metrics:read` ve indicadores/vínculos pero no puede crear/editar/vincular.
   - `metrics:write` (org-admin) puede gestionar indicadores y vínculos.
   - Un rol sin permisos de métricas no ve el módulo.
