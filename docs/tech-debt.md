# Deuda técnica conocida

> Items de mejora, refactor o limpieza identificados durante el desarrollo
> que NO son urgentes pero conviene atender más adelante.

## Producto

### Permission gating en gestión de períodos usa isSuperadmin
- **Qué**: los botones "Crear período", "Cerrar período" y "Activar período" usan `isSuperadmin` en lugar de un permiso granular del RBAC.
- **Por qué importa**: cuando aparezcan roles como `org-admin` no-superadmin, esos usuarios no van a poder gestionar períodos en su propia org.
- **Posible solución**: reemplazar checks `isSuperadmin` por `hasPermission(user, 'period:manage')` o equivalente. Definir el permiso en el sistema RBAC (ADR-0004).
- **Prioridad**: media. Activa cuando se agreguen usuarios no-superadmin reales.

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

