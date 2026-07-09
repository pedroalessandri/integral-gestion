# TODO

> Pendientes de desarrollo del proyecto. Items concretos para próximas
> sesiones de trabajo. Cada item tiene contexto suficiente para retomar
> sin re-investigar.

## 🔥 Prioridad alta — próxima sesión

### [F] Módulo 1 "Indicadores de gestión" — backend en main, frontend en branch (pendiente de merge)
- Estado: backend + modelo común mergeados a main (schema `metrics`, feature-gating vía `core.module`/`organization_module` + ModuleEnabledGuard, permisos `metrics:*`, package `metrics-domain`, endpoints ABM + carga con serie esperado-vs-real). Frontend implementado en el branch `feature/indicadores-m1-frontend`, pendiente de merge: nav "Indicadores de gestión" gated por `enabledModules` de /me, catálogo (Pantalla 1), detalle (Pantalla 2: gráfico SVG esperado vs. real + panel de carga + historial), tab "Módulos" en Configuración (toggles enable/disable superadmin con la dependencia indicadores-okr → indicadores-gestion).
- Al mergear el frontend: mover este ítem a "Recientemente completados" con la fecha.
- Nota: el kebab del catálogo y del historial ya aplica el fix del bug [B] "kebab queda abierto tras cerrar dialog" (DropdownMenu controlado por el padre). El bug [B] sigue abierto para los kebabs de objetivos/KRs/tareas.

### [F] Implementar Módulo 2 "Indicadores en OKRs"
- Por qué: KRs con progreso automático derivado de indicadores. Alcance en docs/features/indicadores-okr.md (pendiente de aprobación).
- Detalles: `progress_mode` en KR, MetricKrLink (baseline/target snapshot), hook de recálculo vía API pública del módulo OKR (la cascada existente no se toca), indicadores de contexto a nivel objetivo. Requiere Módulo 1 (backend + frontend) mergeado y módulo `indicadores-gestion` habilitado.
- Estimado: corrida grande. Bloqueado por el ítem anterior.

## 🟡 Prioridad media — próximas semanas

### [B] Loading state del dropdown de responsable
- Por qué: en el dialog de crear/editar Objective, KR y Task, el campo "Responsable" aparece vacío durante ~1 segundo mientras se hace el fetch del listado de members, y después aparece el nombre. Visualmente queda como si el campo no estuviera asignado.
- Posible solución: mostrar un skeleton o disabled+spinner hasta que el fetch resuelva. El estado `loading` ya está en OwnerSelect, solo falta usarlo visualmente.
- Estimado: corrida muy chica (~10 min).

### [B] Kebab menu de tareas y KRs queda abierto al cerrar dialog
- Por qué: click en los 3 puntitos abre el DropdownMenu; al elegir una opción se abre un Dialog (ej. Editar); cuando se cierra el Dialog, el DropdownMenu queda visible. Pasa en tareas Y key results.
- Posible solución: controlar el state del DropdownMenu desde el padre y forzar `setMenuOpen(false)` en el `onSelect` antes de abrir el Dialog. Patrón típico de shadcn cuando un MenuItem dispara un Dialog.
- Estimado: corrida chica (~15-20 min).

## 🔵 Prioridad baja / cuando haya tiempo

### [R] Convergir CascadeResponse local en (app)/objectives/[id]/page.tsx con ObjectiveCascadeDto
- Por qué: deuda flagueada en la corrida feat/objective-owner-assignment. El detail page usa un type local en lugar del DTO compartido.
- Posible solución: importar ObjectiveCascadeDto desde @gestion-publica/shared-types y borrar el type local.
- Estimado: corrida cortita (~10 min).

### [F] Mostrar avatar de owner en Vista Ejecutiva (Gantt)
- Por qué: la asignación de owner se implementó en listado y detalle, pero no en la Vista Ejecutiva. Out of scope deliberado en la corrida δ.
- Detalles: agregar columna o avatar inline en gantt-row.tsx con el owner del Objective/KR/Task.
- Estimado: corrida chica (~15 min).

### [F] Permitir borrar/desasignar owner desde el detalle del objetivo sin pasar por edit completo
- Por qué: hoy para cambiar owner abrís el dialog de "Editar objetivo" entero. Sería más rápido un click directo.
- Estimado: corrida chica (~15 min).

## ✅ Recientemente completados (últimos 30 días)

- [F] Vista Ejecutiva: banda de meses sobre el eje del Gantt (reemplaza el ajuste pedido de formato "d MMM") — mergeado el 11 mayo 2026
- [F] Detalle objetivo: zona peligrosa removida + suma de pesos minimizada cuando balancea — mergeado el 11 mayo 2026
- [F] Vista Ejecutiva Gantt — mergeado el 2 mayo 2026
- [F] Iconos Lucide reemplazando badges + axis anchors en Gantt — mergeado el 2 mayo 2026
- [F] Asignación de owner a Objetivos / KRs / Tasks — mergeado el 2 mayo 2026
- [B] OwnerSelect dropdown mostraba "Sin miembros" — mergeado el 2 mayo 2026
- [F] Vista ejecutiva: análisis funcional separado en docs/features/executive-view.md — mergeado el 2 mayo 2026

## 📚 Notas operativas

### Convenciones de prefijos
- [F] = Feature (funcionalidad nueva)
- [B] = Bug
- [R] = Refactor (deuda específica que merece corrida propia, NO va en docs/tech-debt.md si tiene urgencia o impacto visible)
- [I] = Idea (sin compromiso de hacerlo, capturada para evaluar después)

### Lifecycle
- Se agregan en la sección de prioridad correspondiente.
- Cuando se completan, se mueven a "Recientemente completados" con fecha de merge.
- Items en "Recientemente completados" más viejos a 30 días se borran (el git log mantiene el histórico real).
- Si un item se descarta sin hacerse, se borra de TODO.md (con un comentario en el commit explicando por qué).

### Diferencia con docs/tech-debt.md
- TODO.md: trabajo pendiente con valor visible (features, bugs, ideas).
- tech-debt.md: deuda de código que no afecta funcionalidad (lint, naming, refactors invisibles, missing tests).
- Si dudás, va en TODO.md. tech-debt.md es para items de muy bajo impacto.
