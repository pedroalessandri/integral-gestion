# 0007 — Arquitectura de despliegue y dominios custom

**Status**: Aceptada
**Supersedes**: none. **Superseded by**: none.
**Date**: 2026-04-28
**Author**: Pedro Alessandri
**Spec**: N/A — derivada de decisiones operativas tomadas durante la migración de URLs free-tier a dominio custom (`gestion.pialab.dev`) y de las lecciones aprendidas en ese proceso.

---

## Contexto y problema

La arquitectura de despliegue evolucionó de URLs auto-generadas por las plataformas free-tier (Vercel y Railway) a un dominio custom. El frontend hoy se sirve en `gestion.pialab.dev`, gestionado por Vercel. El backend está pendiente de migrar de `gestion-publicaapi-production.up.railway.app` a `apigestion.pialab.dev` en Railway. El DNS es autoritativo en Cloudflare, operando en modo DNS-only (nube gris).

Este ADR formaliza la arquitectura resultante, decide las piezas pendientes (custom domain del backend), y captura las lecciones operativas de la migración para que mantenedores futuros no repitan los mismos errores.

---

## Decisión

### D1 — Topología de despliegue

El sistema adopta la siguiente distribución de responsabilidades entre proveedores:

| Componente | Plataforma | Dominio canónico |
|---|---|---|
| Frontend (Next.js) | Vercel | `gestion.pialab.dev` |
| Backend (NestJS) | Railway | `apigestion.pialab.dev` (pendiente — ver D3) |
| DNS autoritativo | Cloudflare | — |

**Justificación**: Vercel es zero-config para Next.js con SSL automático y preview deployments por rama. Railway es zero-config para contenedores Node con soporte de variables de entorno seguras y rollback. Cloudflare provee DNS gratis, es el proveedor autoritativo más flexible del mercado y no genera lock-in al proveedor de hosting.

### D2 — Modo proxy de Cloudflare: DNS-only para el MVP

Cloudflare opera en modo **DNS-only** (nube gris, sin proxy activo) para todos los registros del dominio `pialab.dev`.

**Razones**:

1. El TLD `.dev` está en la lista HSTS preload de los browsers; HTTPS se fuerza a nivel browser independientemente del estado del proxy de Cloudflare.
2. Vercel y Railway ya emiten y rotan certificados Let's Encrypt automáticamente para sus dominios custom. No se necesita la terminación SSL de Cloudflare.
3. El modo proxy naranja con configuración SSL "Flexible" generó bucles de redirección en testing inicial (el origen recibe HTTP, redirige a HTTPS, Cloudflare reenvía de nuevo al mismo ciclo). Evitar este gotcha es razón suficiente para mantenerse en DNS-only.

**Condiciones para migrar a modo proxied (naranja) en el futuro**:
- Necesidad de WAF ante ataques observados y documentados.
- Necesidad de ocultar las IPs de los servidores de origen por razones de seguridad.
- Volumen de tráfico estático donde el caching de Cloudflare produzca ahorro de costos medible.

Si se migra a modo proxied, configurar SSL en modo "Full (strict)" —nunca "Flexible"— para evitar los bucles de redirección documentados.

### D3 — Custom domain del backend: decidido, implementación pendiente

El backend va a migrar de `gestion-publicaapi-production.up.railway.app` a `apigestion.pialab.dev`. La decisión está tomada; la ejecución (agregar el dominio en el dashboard de Railway y crear el registro CNAME en Cloudflare) queda como trabajo operativo pendiente.

Hasta que se ejecute, el sistema funciona sobre la URL auto-generada de Railway sin impacto en funcionalidad.

**Justificación**:
- Consistencia de branding con el dominio del frontend.
- Portabilidad: migrar de proveedor de hosting se reduce a actualizar un registro CNAME, sin cambios de código ni de configuración de clientes.
- Desacople de las convenciones de naming de URLs de Railway, que pueden cambiar.

### D4 — Estrategia de SSL: certificados gestionados por cada plataforma

Cada plataforma gestiona su propio ciclo de vida de certificados SSL de forma autónoma:

- Vercel emite y rota el certificado de `gestion.pialab.dev`.
- Railway emite y rota el certificado de `apigestion.pialab.dev`.
- Cloudflare en modo DNS-only no participa en la terminación TLS.

**Trade-off**: hay dependencia de la infraestructura de certificados de cada proveedor. Esta dependencia se acepta porque ambas plataformas ofrecen SLAs de disponibilidad ≥ 99.9% y la rotación es automática cada 90 días, lo que elimina el riesgo de expiración manual.

Si en el futuro se habilita el modo proxy de Cloudflare (D2), cambiar la configuración SSL de Cloudflare a modo "Full (strict)" antes de activarlo.

### D5 — Política de allow-list de CORS

`CORS_ALLOWED_ORIGINS` en producción incluye múltiples orígenes:

- `https://gestion.pialab.dev` (dominio canónico del frontend)
- `https://<nombre-del-proyecto>.vercel.app` (URL auto-generada de Vercel)

**Razón**: la URL auto-generada de Vercel es pública e inaccesible de ocultar. Mantenerla en la allow-list permite hacer debugging directo de deploys sin necesidad de navegar por el DNS de Cloudflare, lo que agiliza el ciclo de desarrollo y QA.

**Trade-off aceptado**: la superficie de orígenes aceptados es ligeramente más amplia que el mínimo estricto. Se acepta porque Auth0 valida la sesión de usuario en todos los casos, por lo que el riesgo de seguridad real es bajo.

**Revisión futura**: cuando el naming de la aplicación Auth0 se alinee con el rename post-ADR-0008, reevaluar si conviene recortar la URL de Vercel de la allow-list.

### D6 — Estrategia de variables de entorno

Tres ubicaciones con responsabilidades claras y sin solapamiento:

| Ubicación | Rol |
|---|---|
| Dashboards de Vercel / Railway | Única fuente de verdad para valores runtime de producción. |
| `.env.example` en el repo | Catálogo declarativo de todas las variables requeridas, con valores de ejemplo o defaults de desarrollo. |
| `.env.local` (gitignored) | Valores reales locales de cada developer. Nunca se commitea. |

**Regla crítica para variables `NEXT_PUBLIC_*`**: en Next.js, las variables con prefijo `NEXT_PUBLIC_` se embeben en el bundle del cliente en tiempo de **build**, no se leen en runtime. Un cambio de valor en el dashboard de Vercel **no tiene efecto** hasta que se dispare un redeploy fresco con la caché de build deshabilitada. Esta distinción costó tiempo real durante la migración; se documenta prominentemente para que futuros mantenedores no caigan en el mismo gotcha.

### D7 — Callback URLs de Auth0

La aplicación de Auth0 mantiene simultáneamente las entradas de los tres entornos:

| Entorno | URL base |
|---|---|
| Dev local | `http://localhost:3001` |
| Vercel directo (fallback de debugging) | `https://<nombre-del-proyecto>.vercel.app` |
| Producción canónica | `https://gestion.pialab.dev` |

Las mismas tres URLs se incluyen en **Allowed Callback URLs** (con sufijo `/auth/callback`), **Allowed Logout URLs** y **Allowed Web Origins**.

**Regla de sincronización**: al migrar a un dominio nuevo, las tres configuraciones (Auth0 Allowed Callback URLs, variable `APP_BASE_URL` y el dominio desde el que los usuarios navegan la app) deben actualizarse **simultáneamente**. La causa raíz del error "state parameter is invalid" (documentado en Lecciones aprendidas) es desincronizar estas tres piezas.

**Poda de URLs**: solo remover entradas después de que la URL de Vercel sea retirada de CORS (D5) y cuando el equipo tenga confianza en que el entorno de desarrollo local es estable.

---

## Lecciones aprendidas

Gotchas operativos observados durante la migración al dominio custom. Se documentan como reglas preventivas.

### L1 — "state parameter is invalid"

**Causa**: `APP_BASE_URL` no coincide con el origin real desde el cual el usuario navega la app. Si `APP_BASE_URL=https://proyecto.vercel.app` pero el usuario navega `https://gestion.pialab.dev`, el SDK de Auth0 setea la cookie de state en `gestion.pialab.dev` pero redirige al callback en `vercel.app`, donde esa cookie no existe. Auth0 rechaza el intercambio.

**Fix**: alinear `APP_BASE_URL` con el dominio canónico desde el que los usuarios acceden. Al migrar a un dominio nuevo, actualizar simultáneamente: (1) Auth0 Allowed Callback URLs, (2) `APP_BASE_URL`, y (3) el dominio efectivamente servido. Los tres en el mismo paso operativo.

### L2 — "Failed to parse URL from \<value\>"

**Causa**: `NEXT_PUBLIC_API_URL` (u otras variables de URL) contiene solo el hostname sin el prefijo de protocolo (ej. `gestion-publicaapi-production.up.railway.app` en lugar de `https://gestion-publicaapi-production.up.railway.app`). El runtime JS rechaza la URL al intentar parsearla.

**Fix**: todas las variables de entorno que representan URLs deben incluir el protocolo completo (`https://`). Documentar en `.env.example` con la URL completa como ejemplo, no solo el hostname.

### L3 — Variables `NEXT_PUBLIC_*` embebidas en build time

**Causa**: tras cambiar el valor de una variable `NEXT_PUBLIC_*` en el dashboard de Vercel, el deploy siguiente puede devolver un cache hit de Turbo y reutilizar el bundle anterior, que tiene el valor viejo embebido.

**Fix**: disparar un redeploy fresco con "Use existing build cache" destildado. Regla operativa: cualquier cambio en variables `NEXT_PUBLIC_*` requiere un redeploy limpio, no un redeploy incremental.

### L4 — Outputs de Turbo incompletos en monorepo con Vercel

**Causa**: `turbo.json` tenía el array `outputs` del task de build sin incluir `.next/**`. Cuando Turbo devolvía un cache hit completo, el directorio `.next/` no estaba en el output cacheado, y Vercel fallaba con `routes-manifest.json not found`.

**Fix aplicado**: agregar `.next/**` (con exclusión de `.next/cache/**`) al array `outputs` del task de build en `turbo.json`.

**Regla**: en monorepos Turbo + Vercel, el array `outputs` del task de build de cualquier app Next.js debe incluir explícitamente todos los directorios que la plataforma de deploy necesita encontrar después de restaurar el cache.

---

## Consecuencias

### Consecuencias positivas

- **Consistencia de branding**: el frontend ya está en dominio custom; el backend lo estará en cuanto se ejecute D3. La experiencia de usuario y de integración no expone URLs de plataforma.
- **Portabilidad**: cambiar de proveedor de hosting se reduce a actualizar un registro CNAME, sin cambios de código ni de configuración de clientes.
- **SSL totalmente gestionado**: no hay certificados que renovar manualmente. El riesgo de expiración accidental es cero.
- **Free tier suficiente**: la combinación Vercel + Railway + Cloudflare DNS cubre el MVP sin costo de infraestructura.
- **Lecciones documentadas**: los cuatro gotchas de L1–L4 están capturados aquí; mantenedores futuros tienen un reference point antes de debuggear.

### Consecuencias negativas / trade-offs aceptados

- **Dependencia de proveedor para SSL**: si Vercel o Railway tienen problemas en su infraestructura de emisión de certificados, el sitio se cae. Riesgo aceptado dado los SLAs de ambas plataformas.
- **URL de Vercel no se puede ocultar**: `*.vercel.app` es pública por diseño de la plataforma. Está documentada como limitación conocida y permanece en la CORS allow-list (D5).
- **CORS permisivo**: la política de D5 es menos estricta que el mínimo teórico. Trade-off operacional aceptado; Auth0 mitiga el riesgo real.
- **Inconsistencia transitoria de naming**: `gestion.pialab.dev` (frontend) y `apigestion.pialab.dev` (backend) son nombres razonables, pero el codebase interno sigue usando `@gestion-publica/*` hasta ADR-0008. No genera impacto funcional; sí genera fricción de comunicación para nuevos mantenedores.

---

## Alternativas consideradas

### A1 — Plataforma única all-in-one (Render, Fly.io)

Desplegar tanto el frontend como el backend en una única plataforma que soporte ambos stacks.

**Por qué se descarta**: la DX de Vercel para Next.js (preview deployments, edge functions, integración nativa con App Router) y la de Railway para NestJS (variables de entorno seguras, rollback, health checks) son best-in-class para el stack elegido. Consolidar en una plataforma genérica implica sacrificar esa DX a cambio de un beneficio operativo (una sola cuenta) que no justifica el costo.

### A2 — Self-hosted en VPS (Hetzner, DigitalOcean)

Desplegar en un servidor propio con Docker Compose o similar.

**Por qué se descarta para el MVP**: la renovación de certificados SSL, el patching del sistema operativo, la automatización de deploys y el monitoreo de disponibilidad representan un costo de operación que supera el ahorro de hosting en el volumen del MVP. Se puede reconsiderar cuando el tráfico justifique infraestructura dedicada o cuando los costos de plataforma superen el costo de operación propia.

### A3 — Cloudflare Pages + Cloudflare Workers (full stack Cloudflare)

Desplegar el frontend en Cloudflare Pages y el backend como un Worker o usando Cloudflare D1.

**Por qué se descarta**: los límites de CPU time y de cold-start de Cloudflare Workers no son compatibles con una app NestJS con conexiones de DB long-lived (pool de conexiones Prisma + PostgreSQL). El modelo de ejecución de Workers (stateless, CPU-time-bounded) requeriría una reescritura significativa del backend.

### A4 — Mismo dominio para frontend y backend (ej. `gestion.pialab.dev/api/*`)

Servir el backend bajo un path del mismo dominio para evitar tener dos dominios y simplificar CORS.

**Por qué se descarta**: separar frontend y backend a nivel de dominio habilita que cada uno escale, se depliegue y, eventualmente, migre de proveedor de forma completamente independiente. Con un path compartido, cualquier cambio de proveedor o de configuración afecta a ambos componentes simultáneamente. El costo de tener dos dominios (CORS allow-list, dos registros DNS) es bajo comparado con ese beneficio.

---

## Open questions

Ninguna. Todas las decisiones operativas están tomadas. El único trabajo pendiente es la implementación de D3 (agregar `apigestion.pialab.dev` como custom domain en Railway y crear el registro CNAME en Cloudflare), que es ejecución directa siguiendo el procedimiento documentado en D2 y D4.

---

## Referencias cruzadas

- [ADR 0006 — Plataforma domain-agnostic](./0006-domain-agnostic-platform.md): el posicionamiento agnóstico es lo que hace coherente tener un dominio custom en lugar de acoplar el despliegue a una URL vertical-específica. D5 de ADR-0006 menciona este ADR como parte de la secuencia de continuación.
- ADR-0008 (pendiente) — Naming, branding y roadmap de rename: abordará la inconsistencia entre el dominio público (`gestion.pialab.dev`) y el naming interno del codebase (`@gestion-publica/*`). D5 de este ADR (CORS allow-list) tiene una revisión pendiente atada a ese ADR.
- [Auth0 — Configure Callback URLs](https://auth0.com/docs/get-started/applications/application-settings)
- [Vercel — Custom Domains](https://vercel.com/docs/projects/domains)
- [Railway — Custom Domains](https://docs.railway.com/guides/public-networking#custom-domains)
