# Deuda técnica conocida

> Items de mejora, refactor o limpieza identificados durante el desarrollo
> que NO son urgentes pero conviene atender más adelante.

## Producto

### Permission gating en gestión de períodos usa isSuperadmin
- **Qué**: los botones "Crear período", "Cerrar período" y "Activar período" usan `isSuperadmin` en lugar de un permiso granular del RBAC.
- **Por qué importa**: cuando aparezcan roles como `org-admin` no-superadmin, esos usuarios no van a poder gestionar períodos en su propia org.
- **Posible solución**: reemplazar checks `isSuperadmin` por `hasPermission(user, 'period:manage')` o equivalente. Definir el permiso en el sistema RBAC (ADR-0004).
- **Prioridad**: media. Activa cuando se agreguen usuarios no-superadmin reales.

### Cálculo de acumulado del indicador duplicado (M2)
- **Qué**: la lógica "acumulado = baseline + Σ incrementos" e interpolación del % vive en `MetricLinkService.currentCumulative` (módulo metrics) y está duplicada en `ObjectiveService.loadAutomaticLinks` (módulo okr), que la reimplementa para poblar el `metricLink` embebido del cascade DTO.
- **Por qué importa**: el módulo okr no puede depender del módulo metrics (metrics ya depende de okr por D-O1 → sería ciclo), así que okr no puede reusar el service; reimplementa el cálculo leyendo las tablas de metrics directo. Si cambia la fórmula de acumulado, hay que tocar dos lugares.
- **Posible solución**: extraer el acumulado a una función pura en `packages/metrics-domain` (p. ej. `accumulate(baseline, increments)`) y que ambos services la usen; o mover el embed del `metricLink` a un paso de composición fuera de okr. Ver docs/features/indicadores-okr.md D-O1.
- **Prioridad**: baja. Ambos caminos están cubiertos por tests; el riesgo es drift si se edita la fórmula.

## Naming

### Rename completo `gestion-publica` → `gestion-integral`
- **Qué**: renombrar package scope `@gestion-publica/*`, carpeta raíz del repo, repo en GitHub, y proyectos en Auth0/Vercel/Railway.
- **Por qué importa**: documentado en ADR-0008. El producto comercial es "Gestión Integral", el código interno todavía dice "gestion-publica".
- **Posible solución**: ver plan de migración detallado en ADR-0008 D7.
- **Prioridad**: baja. No bloquea ningún usuario. Hacer cuando haya tiempo dedicado y baja carga de feature work.

## Infra

### Custom domain del backend (apigestion.pialab.dev)
- **Qué**: el frontend se sirve en `gestion.pialab.dev` (custom domain), pero el backend sigue en `gestion-publicaapi-production.up.railway.app`.
- **Por qué importa**: documentado en ADR-0007 D3 como "decided, pending implementation". Mejora portabilidad y branding.
- **Posible solución**: configurar custom domain en Railway, ajustar `NEXT_PUBLIC_API_URL` y CORS.
- **Prioridad**: baja. Cosmético, no afecta funcionamiento.

### Lint preexistente: eslint-module-utils/resolve
- **Qué**: `pnpm --filter web lint` falla con `Cannot find module 'eslint-module-utils/resolve'`.
- **Por qué importa**: bloquea correr lint local; aún no rompe CI porque CI no corre lint (verificar).
- **Posible solución**: investigar incompatibilidad entre `eslint-config-next@16.x` (Next 15+ flat config) y `eslint-plugin-import`. Probable fix: actualizar `eslint-import-resolver-typescript` o downgrade alguno de los dos.
- **Prioridad**: media. Activa cuando alguien intente correr lint local o cuando se quiera meter en CI.

### Lint preexistente: variable sin usar en task.service.spec.ts
- **Qué**: `pnpm --filter api lint` falla con 1 error: `mockKeyResultFindFirst` asignada pero nunca usada en `apps/api/src/modules/okr/services/task.service.spec.ts:61`. Existe en `main` (no lo introdujo la corrida de indicadores M1). Hay además un warning preexistente de `eslint-disable` sin uso en `ai/providers/openai.provider.ts:12`.
- **Por qué importa**: `pnpm --filter api lint` sale con exit 1 por este error ajeno; enmascara errores de lint nuevos en corridas del api.
- **Posible solución**: borrar el mock sin usar (o prefijarlo con `_`) y quitar el `eslint-disable` sobrante. Corrida trivial.
- **Prioridad**: baja. No afecta typecheck, tests ni build (todos verdes).

