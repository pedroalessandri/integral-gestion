# 0008 — Naming, branding y rename roadmap

**Status**: Aceptada
**Supersedes**: none. **Superseded by**: none.
**Date**: 2026-04-28
**Author**: Pedro Alessandri
**Spec**: N/A — decisión de producto del owner; no está atada a una feature spec.

---

> **Nota crítica de alcance**: Este ADR es de DEFINICIÓN, no de EJECUCIÓN. El product owner ha decidido diferir la implementación del rename indefinidamente. No existe condición disparadora. El nombre técnico `gestion-publica` permanece como identificador técnico legítimo en el codebase hasta que la ejecución sea explícitamente ordenada. No se permiten renames parciales, aliases preventivos ni migraciones incrementales.

---

## Contexto y problema

La plataforma fue concebida con el nombre `gestion-publica`, reflejo de su vertical inicial de sector público. ADR-0006 declaró la plataforma domain-agnostic y formalizó que el scope de npm `@gestion-publica/*` constituye deuda técnica de naming, delegando su resolución íntegramente a este ADR.

Desde ADR-0006, el product owner tomó la decisión de rebautizar comercialmente el producto como **Gestión Integral**. Esa decisión ya se aplicó en el copy de la UI, la documentación de usuario y los prompts del AI Copilot. Lo que quedó pendiente es la alineación de los artefactos técnicos (carpeta del monorepo, scope de npm, repositorio GitHub, nombres de servicios externos) que siguen llevando el nombre legacy.

El problema en términos concretos: existe una brecha entre el nombre público del producto (Gestión Integral) y todos sus identificadores técnicos (`gestion-publica`, `@gestion-publica/*`, `gestion-publicaapi-production.up.railway.app`). Esta brecha genera fricción en el onboarding de nuevos colaboradores, tensión con el posicionamiento domain-agnostic declarado en ADR-0006 y ambigüedad en cualquier comunicación técnica que mezcle ambos contextos.

### Inventario del scope de la migración

Una búsqueda estática sobre el codebase (excluyendo `node_modules`, `dist`, `.next`, y `pnpm-lock.yaml`) revela:

- **60 archivos** importan el scope `@gestion-publica/` (imports en TypeScript).
- **71 archivos** contienen la cadena literal `gestion-publica` (carpetas, nombres de paquete, comentarios, configuraciones, referencias en ADRs y documentación).

Estos números dimensionan la migración y justifican tanto la necesidad de un plan coordinado (D7) como la prohibición de renames parciales (D6).

---

## Decisión

### D1 — Nombre comercial del producto: "Gestión Integral". Sigla: "GI"

El nombre comercial oficial del producto es **Gestión Integral**. La sigla interna es **GI**, que reemplaza a "GP" en cualquier contexto de abreviatura orientado al producto (documentos, presentaciones, prompts del AI Copilot).

Esta decisión es efectiva desde este ADR hacia adelante y ya está implementada en los contextos de presentación (UI, docs, prompts). Lo que resta es alinear los identificadores técnicos según el roadmap de D7.

**Aclaración**: "GI" es una sigla para contextos orientados al producto, no un token de búsqueda en el codebase. No se debe usar "GI" como prefijo de variables, nombres de módulos ni identificadores técnicos, donde rige el nombre completo en kebab-case.

### D2 — Destino del scope de npm: `@gestion-integral/*`

El scope de npm del workspace migrará de `@gestion-publica/*` a `@gestion-integral/*`.

**Justificación**:
- Mapeo 1:1 con el nombre comercial del producto.
- Lowercase, kebab-case, ASCII puro: convención npm estándar.
- Sintagma nominal único: no ambiguo, searchable, descriptivo.
- Un producto = un scope; no se fragmenta en múltiples scopes.

Las alternativas descartadas se documentan en la sección "Alternativas consideradas".

### D3 — Destino de la carpeta raíz del monorepo: `gestion-integral`

La carpeta local del monorepo migrará de `gestion-publica/` a `gestion-integral/`. La misma justificación de D2 aplica: alineación con el nombre comercial, kebab-case, legibilidad.

### D4 — Destino del repositorio GitHub: `gestion-integral`

El repositorio GitHub migrará de `pedroalessandri/gestion-publica` a `pedroalessandri/gestion-integral`.

GitHub genera automáticamente una redirección permanente desde la URL antigua a la nueva para operaciones git (fetch, push, clones) y para la UI web. Esta capacidad es conveniente, pero **no justifica adelantar el rename del repo de forma aislada**. El rename de GitHub se ejecuta como parte de la secuencia coordinada definida en D7, no antes, para evitar estados mixtos (carpeta local con nombre legacy + URL de repositorio con nombre nuevo, por ejemplo).

### D5 — Servicios externos a renombrar al ejecutar la migración

Los siguientes servicios llevan el nombre legacy en sus dashboards de administración. Son cambios cosméticos (no afectan URLs de producción ni flujos de autenticación), pero deben ejecutarse como parte de la secuencia coordinada de D7 para no dejar el sistema en estado semánicamente inconsistente:

| Servicio | Nombre actual (referencial) | Destino |
|---|---|---|
| Auth0 — nombre de aplicación | `gestion-publica-dev` (o similar) | Alinear con nuevo naming |
| Vercel — nombre de proyecto | `gestion-publica` (o similar) | Alinear con nuevo naming |
| Railway — nombre de proyecto | `gestion-publica` (o similar) | Alinear con nuevo naming |

Nota: el rename de la aplicación Auth0 no afecta los Client IDs ni los callback URLs; es puramente un label de dashboard. Sin embargo, el timing debe coordinarse con la revisión de CORS documentada en ADR-0007 D5.

### D6 — La migración está DIFERIDA INDEFINIDAMENTE

La ejecución del rename descrito en este ADR está diferida sin condición disparadora. Las reglas vigentes hasta que la ejecución sea ordenada explícitamente son:

1. El nombre técnico `gestion-publica` es el identificador legítimo activo: en el nombre de la carpeta, en el `package.json` raíz, en el scope de npm de todos los packages, y en la URL del repositorio.
2. **No se permiten renames parciales**: no renombrar un solo package "para probar" o "para ir avanzando". Los estados intermedios (parte de los imports con scope nuevo, parte con scope legacy) son más problemáticos que el estado consistente con el nombre legacy.
3. **No se permiten aliases preventivos**: no agregar `@gestion-integral` como alias o alias de scope junto a `@gestion-publica`. Dos scopes para el mismo producto introduce ambigüedad en imports, en el lockfile, y en tooling de análisis estático.
4. **El código nuevo usa el scope existente `@gestion-publica/*`**: no se anticipa la migración escribiendo imports con el scope nuevo. Cuando se ejecute el rename, el diff debe ser limpio y total.
5. **Este ADR es la referencia canónica** para los nombres destino cuando la ejecución sea eventualmente programada. No hay otro documento que los defina.

### D7 — Plan de migración (ejecutar cuando D6 sea levantado)

Este plan debe seguirse en su totalidad y en orden. Cada paso incluye una validación explícita antes de continuar al siguiente y un rollback si algo falla.

#### PRE-FLIGHT — condiciones obligatorias antes de iniciar

Todas las siguientes deben ser verdaderas antes de empezar el Step 1:

- [ ] Working tree limpio en `main`, sin cambios sin commitear en ningún workspace
- [ ] Sin Pull Requests abiertos
- [ ] Todos los checks de CI en verde
- [ ] Hash de commit de referencia (o backup) registrado antes de empezar
- [ ] Dashboards de Auth0, Vercel y Railway accesibles con permisos de admin
- [ ] Ventana de tiempo de 2-3 horas disponible (el rollback es posible en cada paso pero requiere tiempo)

#### Step 1 — Rename del scope de npm (mayor riesgo; afecta todos los imports)

1. Actualizar el campo `name` en el `package.json` raíz.
2. Actualizar el campo `name` en cada workspace: `apps/api/package.json`, `apps/web/package.json`, todos los `packages/*/package.json` — de `@gestion-publica/<nombre>` a `@gestion-integral/<nombre>`.
3. Revisar `pnpm-workspace.yaml`: actualizar si referencia el scope directamente.
4. Revisar `turbo.json`: actualizar si referencia el scope directamente.
5. Revisar los `tsconfig.json` raíz y de cada workspace: actualizar path aliases si alguno referencia el scope.
6. Actualizar todos los import statements:
   ```bash
   rg -l "@gestion-publica/" --no-ignore-vcs -g '!node_modules' -g '!dist' -g '!.next'
   # Para cada archivo encontrado, reemplazar:
   # "@gestion-publica/" → "@gestion-integral/"
   ```
7. Ejecutar `pnpm install` (regenera el lockfile con los nuevos nombres).
8. Validar:
   ```bash
   pnpm -r typecheck
   pnpm --filter web build
   ```
9. Si la validación pasa, commitear en rama `chore/rename-scope-to-gestion-integral`.

**Rollback de Step 1**: `git checkout main` + `git branch -D chore/rename-scope-to-gestion-integral`. Sin impacto en producción.

#### Step 2 — Rename de la carpeta local del monorepo

1. Guardar cualquier trabajo no relacionado (stash o commit en otra rama).
2. Desde el directorio padre:
   ```bash
   cd ~/proyectos
   mv gestion-publica gestion-integral
   cd gestion-integral
   ```
3. Actualizar cualquier tooling que hardcodee la ruta: archivos de workspace de VS Code, aliases de shell (`.bashrc`, `.zshrc`), scripts locales.
4. Verificar:
   ```bash
   pnpm install
   ```
   El install debe completar sin errores; el lockfile no debería cambiar (mismos paquetes, misma ruta relativa interna).

**Rollback de Step 2**: `mv gestion-integral gestion-publica` + restaurar rutas de tooling.

#### Step 3 — Rename del repositorio en GitHub

1. GitHub web UI: `Settings → General → Repository name` → ingresar `gestion-integral` → confirmar.
2. Actualizar el remote local:
   ```bash
   git remote set-url origin https://github.com/pedroalessandri/gestion-integral.git
   ```
3. Verificar:
   ```bash
   git fetch
   git push
   ```
   Ambos deben operar sobre la nueva URL sin errores.
4. Nota: clones existentes (incluyendo runners de CI) seguirán funcionando vía la redirección automática de GitHub. Sin embargo, conviene actualizar manualmente los remotes de cualquier clon que se sepa que existe (máquinas de desarrollo adicionales, entornos de staging).

**Rollback de Step 3**: GitHub UI `Settings → Repository name` → volver a `gestion-publica`; `git remote set-url origin` de vuelta a la URL antigua.

#### Step 4 — Rename de servicios externos (cosmético, coordinado)

En este orden:
1. **Auth0**: Applications → seleccionar la app → Settings → Application Name → actualizar.
2. **Vercel**: Dashboard → Project Settings → General → Project Name → actualizar.
3. **Railway**: Dashboard → Project Settings → General → Project Name → actualizar.

Ninguno de estos cambios afecta URLs, Client IDs, callback URLs, ni variables de entorno. Son exclusivamente labels de dashboard.

**Rollback de Step 4**: revertir los nombres en cada dashboard. Sin impacto en producción.

#### Step 5 — Validación completa (smoke test)

```bash
# Local
pnpm -r typecheck
pnpm --filter web build
pnpm -r test --if-present
```

Luego, en producción:
- [ ] Push a GitHub — verificar que CI pase.
- [ ] Vercel auto-deploya exitosamente.
- [ ] Railway auto-deploya exitosamente.
- [ ] Flujo de login completo end-to-end (callback Auth0 alineado).
- [ ] Smoke test de la app en producción: cargar dashboard, crear organización, crear OKR, cargar sugerencia del AI Copilot.

**Rollback de Step 5**: si producción falla, revertir el último commit en `main`; Vercel y Railway redesplegarán la versión anterior automáticamente.

#### Estimación de esfuerzo

2–3 horas enfocadas incluyendo validación completa. Riesgo de downtime: mínimo si los pasos se siguen en orden. El rename del scope de npm (Step 1) es el paso de mayor riesgo porque toca todos los imports del workspace; la validación de typecheck posterior es el control principal.

### D8 — Convenciones de naming para packages y módulos futuros (vigentes desde este ADR)

Las siguientes reglas aplican a cualquier package o módulo nuevo creado a partir de la aceptación de este ADR:

**R1 — Un producto = un scope.**
Todos los packages del monorepo usan `@<scope>/<dominio>`. Un único scope por producto. No fragmentar en sub-scopes por área.

**R2 — Identificadores técnicos: lowercase, kebab-case, ASCII puro.**
Sin tildes, sin eñes, sin términos localizados en identificadores técnicos. El nombre legacy `gestion` está grandfathered; la regla aplica a incorporaciones nuevas. Ejemplo: un módulo llamado "Aprobaciones" se empaqueta como `@gestion-integral/approvals` — término en inglés en el identificador, "Aprobaciones" solo en el copy de la UI.

**R3 — Nombres de módulo: sustantivos singulares.**
`@gestion-integral/audit`, no `@gestion-integral/audits`. `@gestion-integral/okr`, no `@gestion-integral/okrs`.

**R4 — Nombres de módulo: describen un dominio, no una implementación.**
`@gestion-integral/auth`, no `@gestion-integral/oauth-client`. `@gestion-integral/okr`, no `@gestion-integral/objective-tracker`.

**R5 — El nombre comercial puede diferir del scope técnico cuando hay razón explícita.**
El caso actual (Gestión Integral / `@gestion-integral`) preserva la alineación por conveniencia. Si en el futuro un producto del mismo publisher tiene un nombre que no se mapea limpiamente a un scope kebab-case, se documenta la desviación en el ADR de ese producto.

**R6 — Los renames mayores requieren ADR previo a la ejecución.**
Ningún rename de scope, de carpeta raíz o de repositorio se ejecuta sin un ADR aceptado que documente el nombre destino, el plan de migración y la decisión de ejecutar. No hay renames silenciosos, no hay drift de scope gradual entre releases.

---

## Consecuencias

### Consecuencias positivas

- **Coherencia de branding**: una vez ejecutado, los artefactos técnicos se alinean con el nombre público del producto. La brecha declarada en ADR-0006 queda saldada.
- **Onboarding sin fricciones**: los nuevos colaboradores encontrarán una relación 1:1 entre el nombre que conocen del producto y los identificadores que ven en el código.
- **Legitimidad del posicionamiento domain-agnostic**: el scope `@gestion-integral` no carga con las connotaciones del sector público que tenía `@gestion-publica`, consolidando la declaración de ADR-0006.
- **Prevención de drift futuro**: las reglas de D8 establecen el contrato de naming para cualquier módulo o package nuevo, evitando que el problema se repita.
- **Plan documentado y validado**: cuando el product owner decida ejecutar, el equipo tiene una guía paso a paso con rollbacks explícitos, sin necesidad de improvisar.

### Consecuencias negativas / trade-offs aceptados

- **El nombre legacy persiste indefinidamente en los artefactos técnicos.** Esta es una elección explícita: el costo de la disonancia se acepta para priorizar desarrollo de funcionalidades. No es un olvido ni un error; es una deuda técnica documentada con nombre, plan y dueño.
- **Período de doble nombre.** Durante la vigencia del diferimiento, el producto se llama "Gestión Integral" públicamente pero su codebase dice `gestion-publica`. Esto puede confundir a quienes lean el código sin contexto. Mitigación: este ADR es la explicación canónica; `CLAUDE.md` o el `README` pueden referenciarlo.
- **Deuda que se acumula con el tiempo.** Cada nuevo colaborador o integración externa que aprende el nombre legacy suma un punto de fricción cuando finalmente se ejecute el rename. El inventario (60 archivos de imports, 71 con la cadena literal) crecerá mientras más código se agregue.
- **El plan de D7 necesitará re-validación antes de ejecutarse.** Las dependencias, versiones de tooling y configuraciones de servicios externos pueden haber cambiado significativamente entre la escritura de este ADR y la ejecución real. Tratar D7 como guía, no como script de ejecución ciega.

---

## Alternativas consideradas

### A1 — Ejecutar el rename ahora

Implementar inmediatamente el plan de D7 en lugar de diferirlo.

**Por qué se descarta**: el product owner tomó la decisión explícita de priorizar el desarrollo de nuevas funcionalidades sobre la limpieza técnica en este momento. La decisión de diferir es del dueño del producto; está registrada aquí para que quede constancia de que fue una elección consciente, no un olvido.

### A2 — Scope corto: `@gi/*`

Usar la sigla del producto como scope de npm.

**Por qué se descarta**: "GI" no es suficientemente searchable en un codebase; colisiona con múltiples términos no relacionados (gastrointestinal, GitHub Issues, Generic Identifier, entre otros) y resulta ambiguo fuera de contexto. La forma larga `@gestion-integral` preserva claridad sin costo significativo de tipeo (lo resuelve el autocompletado del IDE).

### A3 — Mantener `@gestion-publica/*` permanentemente y solo rebrandear en la capa de presentación

Aceptar la disonancia como estado permanente: el nombre técnico no cambia nunca, solo el nombre público.

**Por qué se descarta**: la fricción de onboarding, soporte y documentación que genera la disonancia persistente entre nombre público y nombre técnico tiene un costo que se compone con el tiempo. Vale la pena el esfuerzo puntual del rename para eliminar esa deuda de forma definitiva.

### A4 — Scope basado en el dominio del publisher: `@pialab/*`

Usar el dominio del publisher (`pialab.dev`) como scope de npm en lugar del nombre del producto.

**Por qué se descarta**: el scope debe describir el producto, no el publisher. Si pialab.dev publica múltiples productos en el futuro, conflatar todos bajo un mismo scope es un problema peor que la leve redundancia de incluir el nombre del producto en el scope. Un scope por producto escala mejor.

### A5 — Renames parciales y oportunistas (un package a la vez)

Ir renombrando packages individualmente a medida que se toca ese código, en lugar de una migración atómica.

**Por qué se descarta**: los estados intermedios donde parte de los imports usan `@gestion-integral/` y otra parte usan `@gestion-publica/` generan confusión y aumentan la probabilidad de bugs por referencias desincronizadas. Una migración atómica, aunque requiere una ventana de tiempo mayor, produce un diff limpio y un estado final consistente.

---

## Open questions

Ninguna. Las decisiones están tomadas; solo el timing de la ejecución permanece abierto, y eso es intencional según D6.

---

## Referencias cruzadas

- [ADR 0006 — Plataforma domain-agnostic](./0006-domain-agnostic-platform.md): el posicionamiento domain-agnostic declarado en ADR-0006 es lo que hace necesario el rename. Este ADR cierra la brecha identificada en ADR-0006 D4.
- [ADR 0007 — Arquitectura de despliegue y dominios custom](./0007-deploy-and-custom-domains.md): D5 de este ADR (rename de servicios externos) se coordina con la arquitectura Auth0/Vercel/Railway documentada en ADR-0007. En particular, al ejecutar el rename, revisar la política de CORS documentada en ADR-0007 D5.
- `CLAUDE.md` y `AGENTS.md`: deben actualizarse al ejecutar la migración para reflejar el nuevo naming. No actualizar de forma preventiva.
