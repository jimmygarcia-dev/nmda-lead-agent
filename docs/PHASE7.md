# FASE 7 — Scheduler: el agente que trabaja SOLO, cuando le toca

> Explicado con peras y manzanas, para un junior.
> F1..F6: el agente actúa cuando alguien le habla.
> Ahora: le dejamos "laburo agendado" y se pone a trabajar solo cuando vence.

---

## 1. La gran idea

Hasta ahora el flujo siempre arrancaba con un usuario:

```
user 🗣 "auditá agencias de diseño web"  ----->  agente corre y responde
```

El **scheduler** invierte el inicio: el AGENTE se despierta solo.

```
+----------------+  le dejas el plan escrito   +-----------------+
|    user        | ------------------------>   |  tabla "jobs"   |   SQLite
+----------------+                             +--------+--------+
                                                          |  (cada N segundos)
                                                          v
                                              +---------------------+
                                              |   Scheduler (el ojo) |
                                              +----------+----------+
                                                         |  "este job vence ahora"
                                                         v
                                              +---------------------+
                                              |   Agente completo    |
                                              |   (busca/califica/…) |
                                              +---------------------+
                                                         |
                                                         v
                                             "resultado guardado en el job"
```

Dos responsabilidades separadas:
- **El reloj** (`Scheduler`): revisa cada `pollMs` si algún job vence.
- **El trabajo** (`runner`): cuando vence, ejecuta al agente con el `goal` del job.

---

## 2. ¿Cuándo "vence" un job? (el cron)

Un job dice "corré en este horario" con una **expresión cron de 5 campos**:

```
 minuto  hora  día-del-mes  mes  día-de-la-semana
   0       9       *          *         1      <-- lunes 09:00
   */5     *       *          *         *      <-- cada 5 minutos
   *       *       *          *         *      <-- cada minuto
```

| Campo | Rango | Ejemplo | Significado |
|-------|-------|---------|-------------|
| minuto | 0-59 | `0` | minuto 0 |
| hora | 0-23 | `9` | 09:00 |
| día del mes | 1-31 | `*` | cualquier día |
| mes | 1-12 | `*` | cualquier mes |
| día de la semana | 0-6 (0=domingo) | `1` | los lunes |

El parser soporta `*`, pasos (`*/5`), rangos (`9-17`), valores puntuales y
combos con coma. Es **nuestro** parser (30 líneas), no una librería: para
aprender, no para competir con cron de verdad.

Reglas de un cron real que nos importan:
- **`cronMatches(d)`**: ¿este minuto cumple la expresión? / **`cronNext(d)`**:
  ¿cuál es la próxima vez? (la usa el demo para NO esperar).
- Días: si día-del-mes Y día-de-la-semana están restringidos, alcanza que
  coincida UNO (OR). Si uno es `*`, ese no restringe. *(Este detalle lo
  aprendimos porque el primer intento lo hicimos al revés.)*

---

## 3. Mapa del territorio

```
src/
  scheduler/
    cron.ts       <- parser cron mínimo + matches() + next()
    jobStore.ts   <- table "jobs" en SQLite (sobrevive reinicios)
    scheduler.ts  <- Scheduler: el loop que revisa y dispara (isDue / tick)
    runner.ts     <- construye un agente NUEVO por cada job (memoria fresca)
  smoke/
    scheduler.ts  <- la prueba: reloj fake (sin red) + job real completo
package.json       <- nuevo script: npm run scheduler:test
```

---

## 4. Las piezas

### Pieza 1 — `scheduler/cron.ts`: la agenda del reloj

```js
parseCron("0 9 * * 1")   -> CronSchedule { minute: {values:[0]}, hour: {values:[9]}, ... }
cronMatches(cron, fecha) -> boolean   // ¿en este minuto toca?
cronNext(cron, desde)    -> Date      // próxima vez (escanea minuto a minuto)
```

**En criollo:** el cron es la *receta* del despertador. `matches` mira el reloj
de pared (¿es la hora de la receta?) y `next` mira el calendario (¿cuándo
suena el próximo despertador sin esperar a que llegue?).

### Pieza 2 — `scheduler/jobStore.ts`: el tablero de pedidos

```sql
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule TEXT NOT NULL,        -- "0 9 * * 1"
  goal TEXT NOT NULL,            -- lo que el agente tiene que hacer
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_run_at TEXT,              -- cuándo corrió por última vez
  last_result TEXT,              -- qué pasó (JSON del outcome)
  last_error TEXT                -- qué falló
);
```

**En criollo:** los jobs viven en SQLite (igual que los leads) → sobreviven al
reinicio. Si la app cierra y vuelve, el tablero sigue ahí. El scheduler, al
revisar, pregunta "¿este job vence en este minuto **y no corrió ya en él**?".

### Pieza 3 — `scheduler/scheduler.ts`: el ojo del ciclo

```js
class Scheduler {
  start()              // setInterval -> tick() cada pollMs (default 15s)
  stop()               // clearInterval

  isDue(job, now)      // ¿vence? [cron coincide] && [no corrió en este minuto]
                       //          && [no lo tenés corriendo ya]
  tick(now)            // por cada job habilitado: isDue? -> runner(job) -> recordRun
}
```

Guardas anti-idiota-embotellar:
- **`running` set**: si un agente tarda más que el poll, no lo volvés a disparar.
- **"ya corrió en este minuto"**: mismo cron, mismo minuto → salteo.

**En criollo:** el scheduler es el *vigilante*: da vueltas cada tanto, mira el
tablero, y cuando un job vence activa la alarma (run). Mientras el albañil
(agente) trabaja, el vigilante NO le toca el hombro (guard).

### Pieza 4 — `scheduler/runner.ts`: cómo se ejecuta un job

```js
createAgentJobRunner({ provider, registry, criteria, memory, buildAgent })
  -> (job) => { construye agente NUEVO -> agent.run(job.goal) -> { answer, turns } }
```

**En criollo:** cada ejecución es un agente **fresco**: lee la memoria actual
(base de leads), arranca de cero y hace el `goal` del job. Así el job de las
9 hay ve lo que guardó el de las 8 → no repite empresas (gracias a F5).

---

## 5. Un paseo real (lo que imprime `npm run scheduler:test`)

```
(0) Cron mínimo: la próxima vez de "0 9 * * 1" (lunes 09:00)
  próxima ejecución -> Mon Sep 14 2026 09:00:...   <- no esperamos un lunes

(1) El reloj (runner fake, sin red):
  [scheduler] ejecuto job #1 ("emitir latido del reloj...") cron "* * * * *"
  [scheduler] job #1 OK (1 turnos): latido emitido
  tick #1 -> ejecuciones: 1 (debería ser 1)
  [scheduler] job #1 salteado: ya corrió en este minuto
  tick #2 -> ejecuciones: 1 (debería seguir en 1, no duplica)   <- la guarda

(2) El trabajo (un job real que corre al agente):
  job creado con cron "50 * * * *" (vence este minuto).
  [scheduler] ejecuto job #2 ("Buscá UNA sola agencia de diseño web...")
  [turno 1] search_google(...)            -> busca candidato nuevo
  [turno 2] fetch_page(buenosairesit.com) -> lee el texto completo
  [turno 3] qualify_lead(...)             -> 50/100 quizás (menos de 60 → no guarda)
  [turno 4] final                         -> concluye y termina
  [scheduler] job #2 OK (4 turnos): Después de analizar la información... 

--- estado de jobs en SQLite ---
  [#1] deshabilitado  (fake, ya demostró su punto)
  [#2] HABILITADO  cron 50 * * * *  | último: resultado: {"answer":"...","turns":4}
```

Lo que hay que mirar:

- **El scheduler no duplicó**: dos ticks en el mismo minuto → una sola ejecución.
- **El job corrió al agente completo** y el resultado quedó en `jobs` (SQLite).
- **El estado persiste**: si la app cerrara, el job #2 seguiría agendado.
- Puntaje 50/100 (quizás pero < umbral 60): comportamiento a propósito de F3 —
  el agente califica pero NO guarda lo que no alcanza el mínimo.

---

## 6. Las decisiones que importan (y por qué)

| Decisión | Por qué |
|----------|---------|
| Jobs en **SQLite**, no en memoria | Sobreviven reinicios; el tablero es fuente de verdad. |
| Scheduler **liviano in-process** (poll) | Aprender el concepto sin levantar infra (cron daemon, Redis). |
| Expresión **cron 5 campos** minimalista | Es el lenguaje real de los schedulers; y aprendimos su regla de días. |
| `cronMatches` + `cronNext` separados | Matchear (para correr) y adivinar el futuro (para mostrar) son cosas distintas. |
| Guard "**ya corrió en este minuto**" | Un cron `*` no debe disparar 60 veces en el minuto. |
| Guard "**running**" | Un job lento no debe re-dispararse mientras corre. |
| **Agente nuevo por job** + memoria | La base de leads (F5) evita repetir empresas entre ejecuciones. |
| Resultado del job **guardado en la fila** | Auditoría sin tabla extra; para más historia, tabla `job_runs`. |

---

## 7. Cómo lo pruebo

```bash
npm run scheduler:test
```

El smoke:
1. Muestra `cronNext` de "lunes 9am" (no esperás un lunes).
2. Corre dos ticks con un runner fake y demuestra que el segundo tick NO duplica.
3. Crea un job real con un cron que vence "este minuto" (para no esperar 60 s)
   y deja que el scheduler dispare al agente completo.
4. Imprime el estado de la tabla `jobs` y los leads resultantes.

---

## 8. Checklist "¿lo entendí?"

- [ ] Puedo explicar qué separa "el reloj" (Scheduler) de "el trabajo" (runner).
- [ ] Sé leer `0 9 * * 1` y `*/5 * * * *`.
- [ ] Sé por qué un cron `* * * * *` no debe repetirse 60 veces en un minuto.
- [ ] Entiendo la guarda `running` (por qué no se re-dispara un job lento).
- [ ] Sé por qué los jobs viven en SQLite y no en un `Map` de memoria.
- [ ] Corrí `npm run scheduler:test` y vi: próxima ejecución, no-duplicación y un job real.

---

**Siguiente fase (roadmap):** Observabilidad → Guardrails → Aprobación humana →
multi-agente → producción. (MCP y Scheduler ya adentro; la tabla `job_runs`
queda como pendiente para cuando querramos historia completa.)