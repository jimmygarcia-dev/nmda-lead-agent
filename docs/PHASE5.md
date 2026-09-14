# FASE 5 — Que el agente SE ACUERDE (memoria episódica/long-term)

> Explicado con peras y manzanas, para un junior.
> F4 guardó en un cuaderno. Ahora el agente lo ABRE y lo usa antes de actuar.

---

## 1. La gran idea

En la Fase 4 el agente dejaba de "olvidar todo": escribía en SQLite.
Pero escribir no alcanza si **nunca lee**. Ahora le enseñamos a:

```
  ANTES DE ACTUAR            SE ACUERDA                          Y ACTÚA
  +----------------+         +--------------------------------+   +----------------+
  | "voy a buscar  |         | "esperá, ya audité:            |   | "busco una     |
  |  empresas de   |  ---->  |  Soporte Digital (quizás 59)   | ->| NUEVA, no la   |
  |  diseño web"   |         |  Zapatería Pepe (no 0/100)"    |   |  repito"       |
  +----------------+         +--------------------------------+   +----------------+
```

La **memoria** = el historial persistido convertido en contexto que el modelo
ve al arrancar, más un tool (`recall_memory`) para consultarla en el medio.

Es la misma idea que tu sistema operativo: los "archivos" (SQLite, F4) no
sirven si nadie los abre; la memoria es el "área de trabajo" que los levanta.

---

## 2. Mapa del territorio

```
src/
  memory/
    memory.ts         <- AgentMemory: recupera (recall) y arma el texto de contexto
  tools/
    recall.ts         <- tool recall_memory (consultar la memoria en medio del loop)
  core/
    agent.ts          <- ahora acepta memory y la inyecta al system prompt
  smoke/
    memory.ts         <- la prueba con memoria "sembrada" de días anteriores
package.json           <- nuevo script: npm run memory:test
```

---

## 3. Las piezas

### Pieza 1 — `memory/memory.ts` : la "memoria" (AgentMemory)

Un puente entre la base (F4) y el prompt. Dos operaciones:

| Operación | Qué hace |
|-----------|----------|
| `recall(nRuns, nLeads)` | Va a SQLite y trae: últimas ejecuciones + leads guardados. |
| `toContextText(recall)` | Lo convierte a un bloque de texto LEGIBLE para el modelo. |

El bloque queda así (esto es lo que el modelo "lee de memoria"):

```
Memoria de ejecuciones previas y leads ya guardados:

Ejecuciones previas:
  [#1 - 2026-09-12T...] "Auditar agencias de diseño web..." (3 turnos) -> Audité 2...

Leads ya guardados (NO volver a auditar):
  [2] NO 0/100 - Zapatería Don Pepe (Guadalajara) - https://zapateria-pepe.fake
  [1] QUIZÁS 59/100 - Soporte Digital Labs (México) - https://soportedigital.fake

Si una empresa ya figura entre los leads guardados, no la vuelvas a buscar,
calificar ni guardar...
```

**Detalle fino:** las respuestas se **acortan** a ~160 caracteres. ¿Por qué?
La memoria no debe quemar todo el contexto: alcanza con el "qué se hizo",
no la novela completa.

### Pieza 2 — `core/agent.ts` : la inyección

```
  config = { ..., memory: AgentMemory }

  run(goal):
    1) memoryText = memory.toContextText( memory.recall() )   <-- consulta
    2) systemPrompt = promptBase + memoryText                 <-- injecta
    3) runLoop(...)
```

**En criollo:** antes de que el modelo diga UNA palabra, ya le "cargamos la
cabeza" con lo que pasó. No tiene que adivinar: la historia está en el prompt.

### Pieza 3 — `tools/recall.ts` : el tool

```
  name:      recall_memory
  input:     (ninguno)
  output:    { recentRuns: [...], savedLeads: [...] }
```

**En criollo:** la memoria "asistida". El agente puede pedirla a mitad de
tarea (ej. "¿ya audité esta empresa?") sin esperar a la próxima ejecución.

---

## 4. Un paseo real (turno a turno)

Tenemos la base "sembrada" de días anteriores: Soporte Digital (quizás) y
Zapatería Pepe (no). El agente arranca con esa memoria en el prompt:

```
[turno 1] recall_memory({})          -> "ya audité Zapatería y Soporte Digital"
[turno 2] search_google(...)         -> busca un NUEVO candidato
[turno 3] fetch_page(buenosairesit)  -> lee el texto completo
[turno 4] qualify_lead(...)          -> 59/100 quizás
[turno 5] save_lead(...)             -> guardado con id 3
[turno 6] final                      -> "México IT es nuevo, calificó quizás"
```

Claves del comportamiento:

- **NO re-buscó a Soporte Digital** ni volvió a la zapatería (memoria).
- **Buscó, abrió y guardó algo nuevo** → la memoria CRECIÓ para el futuro.

```
  Antes:  memoria [Soporte, Zapatería]
  Ahora:  memoria [Soporte, Zapatería, México IT]   <- sumó
```

---

## 5. Las decisiones que importan (y por qué)

| Decisión | Por qué |
|----------|---------|
| La memoria se inyecta **al system prompt** | El modelo la ve SIEMPRE, no depende de que recuerde pedirla. |
| También existe el **tool** `recall_memory` | Para consultas "a mitad de obra" (¿ya tengo esto?). |
| Respuestas **acortadas** en la memoria | Control de tokens: contexto completo, texto breve. |
| Los leads guardados traen **veredicto + puntaje** | El modelo sabe qué está "confirmado" y qué "dudoso". |
| Aviso explícito "**no volver a auditar**" | Evita duplicar trabajo (y guardar 3 veces lo mismo). |
| Consumo de F4 (SQLite) con una capa nueva | La F4 guarda, la F5 prepara. Son responsabilidades distintas. |

---

## 6. Cómo lo pruebo

```bash
npm run memory:test
```

El smoke: siembra "memoria vieja" (2 leads + 1 ejecución), muestra el bloque
que se inyecta, corre al agente con `memory` + `criteria` + los tools, y al
final imprime la lista de leads (deberías ver el NUEVO guardado).

---

## 7. Checklist "¿lo entendí?"

- [ ] Puedo explicar la diferencia entre F4 (guardar) y F5 (recordar).
- [ ] Sé en qué momento de `run()` se inyecta la memoria.
- [ ] Sé para qué sirven `recall()` y `toContextText()`.
- [ ] Entiendo por qué se acortan las respuestas guardadas en memoria.
- [ ] Corrí `npm run memory:test` y vi al agente evitar repetir y sumar algo nuevo.

---

**Siguiente fase:** MCP (Model Context Protocol) — servir tools y contexto
a través del estándar abierto.