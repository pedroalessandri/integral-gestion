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
