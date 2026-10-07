# bitacora.md

Registro cronológico de decisiones y corridas. **Una entrada por corrida**, la más reciente arriba.

Formato:

```
## AAAA-MM-DD · Cxx · <rol> · <rama>
- Hecho: <1–3 líneas>
- Commit: <hash>
- Verificación: <comando → resultado en una línea>
- Pendiente / desvíos: <si hubo>
- Preguntas abiertas: <decisiones no cubiertas por la SPEC, si hubo>
```

---

## 2026-10-07 · C02 · architect · feature/plan-f1-adr
- Hecho: ADR-0009 (`docs/adr/0009-planificacion-gobierno-5-niveles.md`, Proposed): vertical declarado, reorientación en el mismo repo, modelo y nombres finales (schema `planning` nuevo; `okr` no se renombra), pesos todo-o-nada, dos lecturas, expand → migrate → contract y decisiones D-a…D-d de Pedro. ADR-0006 lleva "Amended by: 0009". SPEC alineada (períodos configurables, RN-P3, `linkMode`, `Project.progressMode`, RN-P14b).
- Commit: este commit (`docs(okr): ADR-0009 planificación de gobierno en 5 niveles`)
- Verificación: `ls docs/adr` + `grep "Amended by"` + `wc -l` ADR-0009 + `grep linkMode|configurable` en la SPEC → OK
- Pendiente / desvíos: decisiones de diseño propias del architect, a revisar por Pedro: validaciones sincrónicas entre módulos por puertos con token en `apps/api/src/common/contracts/` (`INDICATOR_LINK_READER`, `PROJECT_LINK_READER`, `PERIOD_RANGE_CHECKER_*`) en lugar de `emitAsync` (ajuste de Pedro: sin listener, `emitAsync` pasa en silencio); eventos de dominio solo post-commit; `Project.sourceObjectiveIndicatorId`; unicidad `(objective_id, metric_id)` y `metric.period_id = objective.period_id`; dependencia nueva `@nestjs/event-emitter`.
- Preguntas abiertas: PA-1…PA-5 quedan como Open questions del ADR con el default de la SPEC. Migración resuelta por Pedro en ADR-0009 D6: idempotencia con `legacy_key_result_id` y actor `system:migration`.

## 2026-10-07 · C01 · architect · feature/plan-f1-adr
- Hecho: discovery de impacto de la reorientación a 5 niveles: mapa de uso de `KeyResult`, `MetricKrLink`, `Task.keyResultId`, `progressCachedBp` y `weightBp` (schema, API, paquetes, web), tests afectados, tabla archivo → cambio → fase y 15 riesgos no contemplados por la SPEC.
- Commit: este commit (`docs(okr): discovery de impacto de planificación de gobierno`)
- Verificación: `wc -l docs/features/planificacion-gobierno-impacto.md` → 85 líneas (máx. 150)
- Pendiente / desvíos: ninguno. Sin cambios de código.
- Preguntas abiertas (para ADR-0009 / Pedro):
  - ~~copiloto IA usa KR y bloquea el contract (F10): ¿adaptar antes, deshabilitar o postergar?~~ ✅ Resuelta en ADR-0009 D9 (D-a).
  - ~~sentido de la dependencia `okr` ↔ `metrics` (hoy metrics → okr; RN-P13 la invierte);~~ ✅ Resuelta en ADR-0009 D5 (D-b).
  - ~~qué hacer en la migración con objetivos y métricas en períodos trimestrales (RN-P3 pide anual);~~ ✅ Resuelta en ADR-0009 D7 (D-c).
  - ~~regla de verdad entre base/meta/dirección de `Metric` y de `ObjectiveIndicator`;~~ ✅ Resuelta en ADR-0009 D8 (D-d).
  - ~~mecanismo de idempotencia del script de migración y actor de los eventos `migration.*`.~~ ✅ Resuelta en ADR-0009 D6 (`legacy_key_result_id`, `system:migration`).

## 2026-10-07 · Decisión · Pedro (con Claude) · —
- Hecho: tras la demo con consultores de sector público se decide reorientar el dominio de OKR al modelo de planificación de gobierno de 5 niveles: Visión → Ejes → Visión/Misión por unidad → Objetivos estratégicos con indicadores → Proyectos y tareas.
- Se descartan el fork y el módulo paralelo; se reorienta el dominio en el mismo repo. El sector público pasa a ser el vertical declarado (ADR-0006 D2.5; se formaliza en ADR-0009).
- Feedback de origen:
  - falta de trazabilidad entre objetivo e indicador;
  - el avance de gestión no impacta en el indicador (deseable solo en indicadores lineales);
  - el avance automático del indicador hacia el KR no tiene utilidad;
  - la ponderación debería ser opcional;
  - falta definir cómo se instrumenta por nivel;
  - no está claro qué impacto tiene la frecuencia;
  - falta poder marcar la curva esperada.
- Artefactos: `docs/features/planificacion-gobierno.md` (SPEC), `plan.md`.
- Preguntas abiertas: PA-1…PA-5 en la SPEC §8.
