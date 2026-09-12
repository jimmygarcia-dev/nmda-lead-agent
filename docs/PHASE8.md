# FASE 8 — Observabilidad: ver DENTRO del agente mientras trabaja

> Explicado con peras y manzanas, para un junior.
> F1..F7: el agente trabajaba y solo le creíamos.
> Ahora le ponemos CÁMARAS: vemos cada decisión, cuánto tardó y cuánto gastó.

---

## 1. La gran idea

Un agente que piensa-decide-actúa es una caja negra: entra un objetivo, sale una
respuesta. ¿Qué pasó adentro? ¿Dónde se gastó el tiempo? ¿Cuántas llamadas al
LLM? ¿Algún tool falló?

La observabilidad es ponerle **instrumentos de medición** al loop:

```
   usuario                       DENTRO del agente                  usuario
   --------->   [ think (LLM) -> act (tool) -> observe ]  -------->  respuesta
                     ▲            ▲            ▲
                     └──── TODO MEDIBLE Y REGISTRABLE ────┘

   "¿qué decidió?  ¿cuánto tardó el LLM?  ¿cuántos tokens?  ¿cuál tool?  ¿falló?"
```

Dos herramientas que se llevan bien:
- **Traces** (rastros): el *árbol* de una ejecución concreta — run → turnos →
  LLM/tools — cada uno con su duración. "¿Qué pasó EN ESTA corrida?"
- **Métricas** (medidas agregadas): contadores y promedios. "¿Cómo ANDUVO
  todo?" (cuántas corridas, promedio de LLM, errores por tool).

---

## 2. ¿Cómo se engancha sin ensuciar el core? (el Observer)

El loop no tiene que saber nada de observabilidad. Solo emite eventos. Quien
quiera mirar, se suscribe:

```
              +------------------------------------ core (agente) ----+
  evento      |                                                       |
  ---->       |  runStart(objetivo)                                  |
              |  llmCall:  { turno, ms, tokens }   <-- en cada chat   |
              |  toolCall: { turno, tool, ms, ok } <-- en cada tool   |
              |  runEnd:   { final, turnos, ms }                      |
              +--------------------------------------------------------+
                                      |
                                      v (en el "mundo exterior")
              +------------+   +------------+   +----------------+
              |  Tracer    |   |  Metrics   |   |  (futuro: logs, │
              |  (árbol)   |   | (resumen)  |   |   dashboard)   |
              +------------+   +------------+   +----------------+
```

Esa es la interfaz (`AgentObserver`): 4 métodos, nada de acoplarse al loop.

> **En criollo:** el agente es el *conductor*; el observer es la *cámara de
> seguridad* y el *computador de tablero*. El conductor conduce; la cámara mira.
> Y como hablan por un contrato chico (4 eventos), mañana el "tablero" puede
> ser una base de datos o un dashboard sin tocar el core.

---

## 3. Mapa del territorio

```
src/
  observability/
    types.ts     <- interface AgentObserver (los 4 eventos)
    tracer.ts    <- Tracer: arma el árbol de spans + lo dibuja
    metrics.ts   <- Metrics: agregados + resumen en texto
    composite.ts <- CompositeObserver: manda cada evento a varios observers
  core/
    loop.ts      <- emite llmCall (en cada chat) y toolCall (en cada tool)
    agent.ts     <- emite runStart y runEnd (los límites de la ejecución)
  smoke/
    observability.ts <- la prueba: agente real con tracer + metrics juntos
package.json   <- nuevo script: npm run obs:test
```

Plus: la pieza paradigmática — **el core solo emite; no conoce la implementación**.

---

## 4. Las piezas

### Pieza 1 — `types.ts`: el contrato de 4 eventos

```ts
interface AgentObserver {
  onRunStart(goal: string): void;
  onLlmCall({ turn, ms, promptTokens, completionTokens }): void;
  onToolCall({ turn, tool, ms, ok, error? }): void;
  onRunEnd({ final, turns, steps, ms, answerLength }): void;
}
```

Nótese que los eventos ya traen lo que se necesita medir: **ms** (tiempo),
**tokens**, **ok/error**. El observador es pasivo: el core lo invoca, él no
toca nada del agente.

### Pieza 2 — `tracer.ts`: el árbol de la ejecución

```ts
span = { kind: 'run' | 'llm' | 'tool', name, turn, ms, ok, error? }

run "Buscá agencia..." (5 turnos) · 138786ms
├── [llm]  #1 llm decisión (1219+61 tokens)  · 7424ms  ok
├── [tool] #1 search_google                  · 826ms   ok
├── [llm]  #2 llm decisión (1670+81 tokens)  · 12583ms ok
├── [tool] #2 fetch_page                     · 1971ms  ok
...
```

Además `toJSON()` devuelve los spans **como datos** → cambios de un día para
exportarlos a Un almacén de traces (OTLP, JSONL, SQLite...).

**En criollo:** el tracer es la *filmación*: un registro enumerado de cada
chispazo (LLM) y cada movimiento (tool) con su duración. Sirve para mirar
UNA corrida con lupa.

### Pieza 3 — `metrics.ts`: el tablero agregado

```ts
métricas de la ejecución:
  corridas       1
  duración       138.8s
  turnos         5
  llamadas LLM   5  (avg 27196ms)
  tokens         15210 prompt + 736 completion
  longitud final 266 caracteres
  tools:
    search_google 1 llamadas · avg 826ms · 0 errores
    fetch_page    1 llamadas · avg 1971ms · 0 errores
    ...
```

**En criollo:** las métricas son el *computador de tablero*: no te cuentan la
historia, te dan las cifras. "El tool X tarda 10 segundos en promedio" es un
dato agregado; los traces te dicen POR QUÉ.

### Pieza 4 — `composite.ts`: varias cámaras a la vez

```ts
const observer = new CompositeObserver(tracer, metrics);
// y el futuro: CompositeObserver(tracer, metrics, logsSqlite, exporterOtlp)
```

Una sola interfaz, N consumidores. Mañana agregar persistencia de traces en
SQLite es escribir otro observer y sumarlo acá — cero cambios en el core.

### Pieza 5 — los hooks mínimos en el core

- `loop.ts`: envuelve `provider.chat` y `registry.execute` (mediante dos
  helpers `chatWithObserver` / `toolCallWithObserver`) que miden **ms**, leen
  los **tokens** (`ChatResult.usage` de F1) y el **ok/error** del tool. El LLM
  atrasado (F1 existe) se registra también, con turno `maxTurns + 1`.
- `agent.ts`: emite `runStart(objetivo)` y `runEnd(...)` (incluye si terminó
  con `kind=final` o se agotaron turnos, y la duración total).

> Dato técnico que se aprende en el camino: el narrowing de TypeScript se
> pierde dentro de closures, por eso `toolName`/`toolArgs` se capturan en
> `const` antes del cierre (error `Property 'args' does not exist...`).

---

## 5. El paseo real (lo que imprime `npm run obs:test`)

```
[turno 1] Empecemos buscando una agencia de diseño web en Buenos Aires.
[turno 2] El primer resultado es https://buenosairesit.com/. Voy a abrir su página con fetch_page...
[turno 3] Analizo el texto completo de la página de Buenos Aires IT para calificarla.
[turno 4] 59/100, cerca del mínimo... no supera 60 pero la guardo como quizás.
[turno 5] El lead fue guardado con ID 1. Finalizo.

respuesta: ...Buenos Aires IT calificada 59/100 (quizás), guardada con ID 1...

trace (árbol de ejecución):            <- LO NUEVO: la lupa
  run ... (5 turnos) · 138786ms
  ├── [llm]  #1 (1219+61 tokens) · 7424ms ok
  ├── [tool] #1 search_google · 826ms ok
  ...
  └── [llm]  #5 (4447+146 tokens) · 26502ms ok

métricas de la ejecución:              <- LO NUEVO: el tablero
  llamadas LLM 5 (avg 27196ms) · tokens 15210+736 · tools: search 1, fetch 1, ...
```

Lo que revelan los números (esto vale oro):

- **El LLM es el cuello de botella**: cada decisión tarda entre 7s y 51s;
  los tools (search/fetch/qualify/save) tardan < 2s.
- **El contexto crece**: los tokens de prompt suben 1.2K -> 4.4K por turno.
  (Ahí es donde la "memoria acortada" de F5 sigue cuidando el presupuesto.)
- **Sin observabilidad**, no tendrías ni idea de dónde va el tiempo.

---

## 6. Las decisiones que importan (y por qué)

| Decisión | Por qué |
|----------|---------|
| Interfaz **`AgentObserver`** de 4 eventos | El core emite, no conoce consumidores: desacople limpio. |
| Eventos ya con **ms / tokens / ok** | El que mide no re-mide; los datos llegan listos. |
| **Traces** (una corrida) + **métricas** (resumen) | Responden preguntas distintas: "qué pasó" vs "cómo anduvo". |
| `CompositeObserver` | Preparado para N consumidores futuros sin tocar el core. |
| Los spans son **datos** (`toJSON`) | Hoy se imprimen; mañana se exportan (OTLP, SQLite, dashboard). |
| Hooks en `loop.ts`/`agent.ts` con helpers | El coste de medir no ensucia el flujo lógico del loop. |

---

## 7. Cómo lo pruebo

```bash
npm run obs:test
```

El smoke: corre al agente real con el `CompositeObserver(tracer, metrics)` y
muestra: 1) los turnos (verbose), 2) la respuesta, 3) el **árbol de trace** con
duraciones y tokens, 4) el **resumen de métricas**, y 5) los **spans en JSON**
(≈ lo que se exportaría).

---

## 8. Checklist "¿lo entendí?"

- [ ] Puedo explicar la diferencia entre un **trace** (cada ejecución, con lupa)
      y una **métrica** (agregado). 
- [ ] Sé por qué el core solo **emite eventos** y no conoce al Tracer/Metrics.
- [ ] Nombro los 4 eventos de `AgentObserver`.
- [ ] Entiendo de qué se dió cuenta el smoke: el LLM domina el tiempo y los
      tokens crecen por turno.
- [ ] Corrí `npm run obs:test` y sé leer el árbol y el resumen.

---

**Siguiente fase (roadmap):** Guardrails → aprobación humana → multi-agente →
producción. La observabilidad ya dejó la puerta abierta: exportar traces a
SQLite o a un dashboard será escribir un observer más.