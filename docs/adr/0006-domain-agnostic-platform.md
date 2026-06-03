# 0006 — Plataforma domain-agnostic: generalización del alcance del producto

**Status**: Aceptada
**Supersedes**: none. **Superseded by**: none.
**Date**: 2026-04-27
**Author**: architect subagent
**Spec**: N/A — derivada de decisión explícita del product owner (Pedro) de desacoplar la plataforma del sector público como vertical exclusivo.

---

> **Nota de revisión**: Los ADRs 0001–0005 fueron redactados en el contexto histórico de un caso de uso de organización del sector público (contexto GCBA). Sus decisiones técnicas (modelo de datos, cascada OKR, audit append-only, RBAC, módulo AI Copilot) siguen vigentes sin modificación. Lo que cambió es la naturaleza de sus justificaciones: las que apelaban a requisitos propios del sector público (formalismo burocrático, trazabilidad normativa, compliance estatal) ahora se declaran como decisiones deliberadas de producto válidas para cualquier organización adoptante. Este ADR absorbe esa generalización y establece las reglas que rigen los módulos futuros. Los ADRs 0001–0005 no se reescriben; ADR-0006 opera como capa de re-lectura canónica sobre sus justificaciones.

---

## Contexto y problema

La plataforma fue concebida inicialmente con supuestos tácitos de sector público: la terminología interna, los ejemplos de uso, los argumentos de las decisiones de diseño y el naming del workspace (`@gestion-publica/*`) asumían implícitamente que los adoptantes serían organismos gubernamentales.

Al evaluar el alcance real de las decisiones técnicas ya tomadas, surge que ninguna de ellas es inherentemente sectorial: la cascada OKR ponderada, el audit log append-only, el RBAC local sobre Auth0, la habilitación de módulos por organización y la separación de schemas Postgres son patrones útiles en cualquier organización que necesite gestión de objetivos con trazabilidad y multi-tenancy.

El problema es que mantener supuestos de sector público como implícitos —sin declararlos ni cuestionarlos— limita el posicionamiento comercial de la plataforma, genera fricción innecesaria al adaptar el producto a nuevos verticales y complica las comunicaciones de diseño (ADRs, specs, AGENTS.md) cuando el interlocutor no es del sector público.

Este ADR formaliza la decisión de operar como plataforma domain-agnostic y establece las reglas que gobiernan ese comportamiento.

### Preguntas ya respondidas (Pedro, 2026-04-27)

1. **Nivel de generalización**: Nivel 2. ADR-0006 opera sobre copy/UI/prompts (Nivel 1, ya ejecutado) y sobre las justificaciones de las decisiones de los ADRs 0001–0005. Las decisiones técnicas se mantienen; sus justificaciones se reclasifican como decisiones de producto deliberadas, no como obligaciones de un vertical específico.

2. **Naming del package scope `@gestion-publica/*`**: Se declara deuda técnica con rename pendiente, delegado íntegramente a ADR-0008. ADR-0006 no compromete un nombre destino.

3. **Supuestos técnicos heredados** (audit append-only, locale `es-AR`, throttler por `auth0Sub`): Son decisiones de producto deliberadas, no obligaciones regulatorias del sector público. No se tocan; ADR-0006 solo aclara la naturaleza de su justificación.

4. **Regla para módulos futuros**: Todo módulo futuro debe diseñarse para ser configurable por organización, sin hardcodear supuestos de ningún vertical específico.

5. **Naming del producto**: ADR-0006 no nombra al producto. La decisión de naming y el rename de scope/folder se delegan íntegramente a ADR-0008 (pendiente).

---

## Decisión

### D1 — Re-clasificación de justificaciones: de "requisito sectorial" a "decisión de producto deliberada"

Las siguientes decisiones de ADRs 0001–0005 fueron justificadas con argumentos de sector público. Se re-clasifican como decisiones de producto deliberadas, válidas para cualquier organización adoptante:

| Decisión técnica | Justificación original (sector público) | Justificación re-clasificada (product-agnostic) |
|---|---|---|
| Audit log append-only con trigger DB (ADR 0003) | Trazabilidad normativa y compliance estatal. | Auditabilidad es un requisito universal en organizaciones que gestionan objetivos con múltiples actores. La inmutabilidad del log protege la integridad del historial ante cualquier actor, no solo ante reguladores. |
| Locale `es-AR` hardcodeado (ADRs 0001–0005, D10 de ADR-0005) | Organismo gubernamental argentino, formalidad administrativa. | Decisión de producto para el mercado inicial (Latinoamérica hispanohablante). La internacionalización completa (i18n) se evalúa en ADR futuro cuando haya demanda concreta de otros locales. No es un supuesto de sector público. |
| Throttler por `auth0Sub` en lugar de por IP (ADR 0004, D10; ADR 0005, D12) | Redes institucionales del sector público (NATs, VPNs gubernamentales). | Decisión técnica correcta para cualquier organización corporativa o institucional donde múltiples usuarios comparten IP. Aplica igualmente a empresas privadas con oficinas centralizadas. |
| RBAC local sobre Auth0 (ADR 0004) | Requisitos de control de acceso de organismos públicos. | El RBAC local permite granularidad y auditabilidad del control de acceso que no ofrece Auth0 solo. Es una decisión de arquitectura válida para cualquier SaaS multi-tenant con roles diferenciados. |
| Formalidad de los prompts del AI Copilot en `es-AR` neutro (ADR 0005, D10) | Comunicación administrativa del sector público. | Decisión de UX para el mercado inicial hispanohablante. "Neutro administrativo" aplica igualmente a empresas privadas, ONGs o consultoras que usan el producto profesionalmente. |
| Separación de schemas Postgres por módulo (ADR 0001) | Segregación de datos propia de organismos con áreas diferenciadas. | Buena práctica de arquitectura modular independiente del vertical: facilita permisos granulares, monitoreo por schema y potencial separación futura en microservicios. |

**Implicación operativa**: ninguna de estas decisiones se revierte ni se modifica. La re-clasificación es semántica —afecta cómo se documenta y comunica el diseño— no técnica.

### D2 — Regla de diseño para módulos futuros: configurabilidad por organización sin supuestos de vertical

Todo módulo nuevo incorporado a la plataforma (a partir de ADR-0006 inclusive) debe cumplir estas condiciones:

1. **Sin hardcodeo de vertical**: el módulo no puede asumir que el adoptante es una organización del sector público, empresa privada, ONG, institución educativa, organismo de salud, ni ningún otro vertical específico.

2. **Configurabilidad por organización**: los parámetros que varían por tipo de organización (nomenclatura, flujos, reglas de negocio opcionales) deben ser configurables en `core.organization` o en una tabla de settings del módulo, no hardcodeados en el código.

3. **Ejemplos y documentación neutrales**: los ADRs, specs y comentarios de código deben usar ejemplos que sean inteligibles para cualquier tipo de organización. Si se usa un ejemplo concreto, se aclara que es ilustrativo.

4. **Módulo habilitable**: todo módulo nuevo es habilitable por organización vía `core.module_enablement` (ADR 0002). Ningún módulo se activa automáticamente para todas las orgs.

5. **Excepción documentada**: si un módulo futuro tiene justificación legítima para asumir un vertical específico (p.ej., un módulo de gestión presupuestaria que solo aplica al sector público por razones normativas), debe declararlo explícitamente en su ADR bajo una sección "Supuesto de vertical declarado" con aprobación del product owner.

### D3 — Los supuestos técnicos heredados se mantienen como están

Los siguientes supuestos técnicos de ADRs 0001–0005, identificados como potencialmente ligados al sector público, se mantienen sin cambio porque son decisiones de producto correctas independientemente del vertical:

- **Locale `es-AR`**: mercado inicial hispanohablante. Internacionalización se evaluará en ADR futuro bajo demanda explícita.
- **Audit append-only**: invariante de integridad de datos con valor universal. No se relaja.
- **Throttler por `auth0Sub`**: correcto para cualquier organización corporativa o institucional. No se cambia.
- **Formalidad de los prompts AI**: decisión de UX para el mercado inicial. No se cambia.

Ninguno de estos supuestos requiere modificación de código, schema ni configuración como consecuencia de ADR-0006.

### D4 — Deuda técnica: rename del package scope `@gestion-publica/*` delegado a ADR-0008

El scope de npm del workspace (`@gestion-publica/*`) y el nombre de la carpeta raíz del monorepo constituyen deuda técnica de naming acumulada desde la concepción del proyecto con supuestos de sector público.

ADR-0006 declara esta deuda explícitamente pero **no la resuelve**. La decisión sobre el nombre destino del producto, del scope npm y de la carpeta del monorepo se delega íntegramente a **ADR-0008**, que cubrirá:

- Naming del producto (marca/nombre comercial).
- Rename del scope npm (`@gestion-publica/*` → propuesto `@gestion-integral/*`, sujeto a confirmación en ADR-0008).
- Rename de la carpeta raíz del repositorio (si aplica).
- Plan de migración de imports afectados.

Hasta que ADR-0008 sea aceptado, `@gestion-publica/*` sigue siendo el scope activo. No se realizan renames parciales ni graduales previos a ADR-0008.

### D5 — Secuencia de ADRs de continuación

ADR-0006 forma parte de una secuencia de tres ADRs que abordan decisiones estructurales pendientes derivadas de la generalización de la plataforma:

- **ADR-0007 (pendiente)** — Deploy y custom domains: arquitectura de deploy en Vercel + Railway + Cloudflare DNS, dominio propio (`gestion.pialab.dev` para frontend, `apigestion.pialab.dev` para backend), gestión de SSL, separación de responsabilidades entre proveedores y aprendizajes operativos del despliegue inicial.
- **ADR-0008 (pendiente)** — Naming, branding y rename roadmap: nombre comercial del producto, rename del scope npm (`@gestion-publica/*` → destino a definir), rename de la carpeta del monorepo, plan de migración de imports y coordinación con servicios externos (Auth0, Vercel, Railway).

ADR-0006 no compromete decisiones que correspondan a estos ADRs.

### D6 — Nomenclatura del producto en este ADR

ADR-0006 no nombra al producto. Todas las referencias internas al producto siguen usando `gestion-publica` como identificador técnico, consistente con el estado actual del codebase. El naming comercial es competencia exclusiva de ADR-0008.

---

## Consecuencias

### Consecuencias positivas

- **Posicionamiento ampliado**: la plataforma puede presentarse a cualquier organización que gestione objetivos (empresas privadas, ONGs, instituciones educativas, organismos gubernamentales) sin fricción conceptual ni comunicacional.
- **ADRs más durables**: las justificaciones de las decisiones técnicas ya no dependen de un contexto sectorial que podría no aplicar al próximo adoptante.
- **Guía clara para módulos futuros**: la regla D2 establece un contrato de diseño explícito que evita que el problema se repita.
- **Deuda técnica explícita**: el rename de scope queda registrado y no se pierde ni se prioriza prematuramente; ADR-0008 lo aborda en el momento correcto.
- **Sin regresiones técnicas**: ninguna decisión técnica existente se revierte. El impacto en el codebase de este ADR es cero (la generalización es semántica y prospectiva).

### Consecuencias negativas / trade-offs aceptados

- **No resuelve el naming hoy**: el scope `@gestion-publica/*` sigue siendo visible en el código hasta ADR-0008. Quien lea el código sin contexto puede confundirse sobre el alcance de la plataforma.
- **La re-clasificación de justificaciones no es retroactiva en los documentos**: los ADRs 0001–0005 mantienen su redacción original en sus archivos; la re-lectura canónica vive aquí, en ADR-0006. Quien lea ADR-0003 sin leer ADR-0006 podría interpretar el audit log como un requisito sectorial. Mitigación: agregar una nota de referencia cruzada a ADR-0006 en los headers de ADRs 0001–0005 (tarea de documentation hygiene, fuera del scope de este ADR si Pedro no lo solicita explícitamente).

---

## Alternativas consideradas

### A1 — Reescribir los ADRs 0001–0005 in-place con justificaciones generalizadas

Editar cada ADR existente para reemplazar las justificaciones de sector público por justificaciones domain-agnostic.

**Por qué se descarta**: los ADRs son registros históricos de decisiones. Editarlos in-place borra el contexto de por qué se tomaron cuando se tomaron, lo que reduce su valor como documentación de la evolución del sistema. ADR-0006 como capa de re-lectura preserva esa historia.

### A2 — Crear un documento de "filosofía de producto" separado (no ADR)

Escribir un documento en `docs/` que explique la orientación domain-agnostic sin usar el formato ADR.

**Por qué se descarta**: las reglas de diseño para módulos futuros (D2) son decisiones arquitectónicas con consecuencias técnicas verificables. El formato ADR es el vehículo correcto: es rastreable, tiene status, y es la referencia canónica que los agentes de diseño consultan.

### A3 — Resolver el rename de scope en este mismo ADR

Incluir en ADR-0006 la decisión sobre el nombre destino (`@<nombre-nuevo>/*`) y el plan de migración.

**Por qué se descarta**: el naming del producto es una decisión de producto, no de arquitectura técnica. Mezclarla con la generalización domain-agnostic introduce un scope creep que retrasa la aceptación de ambas decisiones. ADR-0008 le da el espacio que merece.

### A4 — No hacer nada (mantener supuestos de sector público implícitos)

Dejar el estado actual sin documentar la generalización.

**Por qué se descarta**: el problema ya se materializó (los ADRs 0001–0005 fueron reescritos para neutralizar referencias al sector público). No documentar la decisión que motivó ese cambio deja la plataforma sin una regla de diseño para módulos futuros, lo que garantiza que el problema se repita.

---

## Open questions

**OQ-1** (Pedro, owner): ¿Se agrega una nota de referencia cruzada a ADR-0006 en los headers de los ADRs 0001–0005 como tarea de documentation hygiene? No es bloqueante para aceptar este ADR; es una decisión de mantenimiento de la documentación.

---

## Referencias cruzadas

- [ADR 0001 — Fundación del módulo OKR](./0001-okr-module-foundation.md) — justificaciones técnicas re-clasificadas en D1.
- [ADR 0002 — Fundación del módulo Core](./0002-core-module-foundation.md) — regla de módulos habilitables (D2.4); `core.module_enablement`.
- [ADR 0003 — Fundación del módulo Audit](./0003-audit-module-foundation.md) — audit append-only re-clasificado en D1 y mantenido en D3.
- [ADR 0004 — Fundación del módulo Auth](./0004-auth-module-foundation.md) — RBAC y throttler re-clasificados en D1 y mantenidos en D3.
- [ADR 0005 — Módulo AI Copilot](./0005-ai-copilot-module.md) — locale `es-AR` y prompts re-clasificados en D1 y mantenidos en D3.
- ADR-0007 (pendiente) — Deploy y custom domains.
- ADR-0008 (pendiente) — Naming, branding y rename roadmap.
- `CLAUDE.md` — reglas transversales del proyecto y convenciones de módulo.
- `AGENTS.md` — reglas de dominio OKR y frozen rules.
