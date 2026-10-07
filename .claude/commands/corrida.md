---
description: Ejecuta una corrida de plan.md
argument-hint: <ID de corrida, ej. C04>
---
Corrida $ARGUMENTS de plan.md.
0. Determiná la fase y la rama de $ARGUMENTS según plan.md. Si es la primera corrida de la fase: git checkout main && git pull y crear la rama. Si no: verificar que estás en esa rama y que git status está limpio.
1. Leer CLAUDE.md, la sección $ARGUMENTS de plan.md y las secciones de docs/features/planificacion-gobierno.md y docs/adr/0009-*.md que esa corrida cita. Delegá en el subagente que indica plan.md para $ARGUMENTS.
2. Ejecutar los pasos de $ARGUMENTS en orden. Si algo falla 2 veces, detenerse y reportar. Si aparece una decisión no cubierta por la SPEC o el ADR, no inventarla: anotarla en "Preguntas abiertas" de bitacora.md y detenerse si bloquea.
3. Correr las verificaciones de $ARGUMENTS. Para DB: docker exec + psql, tomando usuario y DB de DATABASE_URL en apps/api/.env.
4. Agregar una entrada en bitacora.md.
5. Commit con mensaje en /tmp/$ARGUMENTS.txt (heredoc).
6. Si es la última corrida de la fase (marcada 🔍 en plan.md): git push -u origin <rama> && gh pr create --base main --fill.
7. Output: hash, tail -20 de cada verificación y, si hubo, la URL del PR.
8. WAITING FOR APPROVAL.
