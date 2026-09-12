# FASE 9 — Guardrails: vallas que se mantienen SOLAS

> Explicado con peras y manzanas, para un junior.
> F1..F8: el agente tenía mucha libertad.
> Ahora le ponemos BARANDAS: límites que no dependen de que el modelo "se porte bien".

---

## 1. La gran idea

Un LLM es impredecible: hoy hace las 4 cosas, mañana se mete en un bucle o
escribe un email de otra persona en la respuesta. **Guardrails** = reglas
deterministas que se cumplen SIEMPRE, sin esperar a que el modelo razone bien.

```
   SIN barandas                          CON barandas
   +---------+                           +---------+  "presupuesto 3 llamadas
   | objetivo|--> [agente libre]         | objetivo|--> | valla (objetivo) |
   +---------+  puede:                  +---------+    | valla (turns)    |
        * pedalear sin límite     ->    | valla (budget LLM/t) |
        * repetir el mismo tool    ->    | valla (tool denylist)|
        * vetar... quería DAR LAT       | valla (repetición) |
                                        | valla (PII)        |
                                        +--------------------+
                                               |  a lo sumo,
                                               v  y sin violar nada
                                        +-------------+
                                        |  agente "con rienda" |
                                        +-------------+
```

Dos familias de vallas:
- **Frontales** (antes de actuar): objetivo peligroso, presupuesto, tool vetado.
- **De salida** (sobre la respuesta): sanitizar datos personales (PII).

---

## 2. Las vallas una por una

| Valla | Cuándo salta | Qué hace | Ejemplo |
|-------|--------------|----------|---------|
| **Objetivo** | Antes de llamar al LLM (turno 0) | Rechaza la corrida entera si el pedido matchea un patrón | "Espiá a la competencia" -> NO |
| **Presupuesto LLM** | Cada turno, antes de llamar | Corta la corrida si pasó N llamadas | presupuesto 3 -> solo 3 decisiones |
| **Presupuesto tiempo** | Cada turno | Corta si lleva + de X ms | 90s -> freno |
| **Denylist de tools** | Antes de ejecutar cada tool | Rechaza el tool y avisa al agente | save_lead vetado -> error en el paso |
| **Repetición** | Antes de ejecutar | Frena si repite el MISMO tool con la MISMA huella N veces | fetch_page{a.com} x3 -> NO |
| **PII en salida** | Sobre la respuesta final | Reemplaza email/DNI/teléfono | juan@.. -> [EMAIL] |

---

## 3. Mapa del territorio

```
src/
  guardrails/
    guardrails.ts     <- class Guardrails: las vallas (estado de la corrida adentro)
  core/
    loop.ts           <- consulta la valla: budget (arriba del turno), tool (antes de ejecutar)
    agent.ts          <- consulta checkGoal (antes del LLM) y checkOutput (sobre la respuesta)
    types.ts          <- AgentConfig.guards
  smoke/
    guardrails.ts     <- vallas unitarias (sin LLM) + una corrida real con budget y denylist
package.json           <- nuevo script: npm run guards:test
```

Regla dorada de diseño: **el LLM no participa de las vallas**. Son código
determinista (regex, contadores, reloj). Si el LLM se equivoca, las vallas NO
se equivocan con él (bueno, las regex... casi nunca).

---

## 4. Las piezas

### Pieza 1 — `guardrails.ts`: el guardia de seguridad

```js
class Guardrails {
  beginRun()                     // estado nuevo: contadores a cero
  checkGoal(goal)     -> GuardCheck   // valla de objetivo (antes del LLM)
  budgetMet()         -> GuardCheck   // ¿superé llamadas LLM o tiempo?
  beforeTool(tool,args) -> GuardCheck // denylist + repetición (huella)
  afterTool(tool,args)               // registra la huella para contar repeticiones
  checkOutput(answer) -> GuardCheck   // saneado de PII (redact + redacted)
}
```

La **"huella"** de repetición es `tool + JSON.stringify(args)`: así `fetch_page`
de dos páginas distintas NO se cuenta como repetición.

### Pieza 2 — hooks en el core (mínimos, como en F8)

- `agent.run()`: `checkGoal(objetivo)` primero. Si cae → responde "rechazado
  por guardrail" **sin gastar una sola llamada al LLM**.
- `loop` (arriba de cada turno): `budgetMet()` → si cae, corta el for y le pide
  al agente responder con kind=final ("Guardrail de presupuesto activado: ...").
- `loop` (antes de cada tool): `beforeTool` → si cae, no ejecuta; registra el
  paso con error y le avisa al modelo para que decida otra cosa.
- `agent.run()` (al final): `checkOutput(respuesta)` → si hay PII, la respuesta
  sale saneada.

---

## 5. El paseo real (guards:test)

```
(1) Vallas deterministas (sin LLM, al instante):
  checkGoal("Buscá agencias...")    -> PERMITIDO
  checkGoal("Espiá a la competencia") -> DENEGADO (patrón bloqueado)   <- turno 0, sin LLM
  beforeTool(save_lead)             -> DENEGADO (denylist)
  beforeTool(search_google)         -> PERMITIDO
  fetch_page{a.com} 1ra->OK 2da->OK 3ra->DENEGADO (repetición x2)
  checkOutput("Contactame a juan@empresa.com.ar o al 11 2345 6789 (DNI 12.345.678).")
    -> "Contactame a [EMAIL] o al [TELÉFONO] (DNI [DNI])."

(2) Corrida real con guardrails (presupuesto 3 llamadas LLM + save_lead vetado):
  [turno 1] search_google(...)  ok
  [turno 2] fetch_page(...)     ok
  [turno 3] qualify_lead(...)   ok (76/100 "sí")
  [turno 9] final               <- el presupuesto cortó en el turno 4
  leads persistidos: 0          <- save_lead estaba en la denylist
```

El detalle que hay que leer: el agente "recomendó guardar", pero **no pudo**:
el tool estaba vetado y el presupuesto cortó la frisa. La valla NO negoció.

---

## 6. Lecciones que ya se sienten (de veras)

- **Los patrones por regex se rompen en el idioma**: `\bespiar\b` NO atrapa
  "Espiá" (tilde + conjugación). La solución robusta es raíz (`\bespi`).
  Los guardrails deterministas necesitan pensarse bien; el resto del día el
  lector final va a mirar esas regex.
- **El LLM como "recomendador" + el guardrail como "cortacircuitos"**: en el
  smoke el modelo quiso guardar y no pudo. Esa es la división sana: el LLM
  propone, la valla dispone.

---

## 7. Cómo lo pruebo

```bash
npm run guards:test
```

1. Las 4 vallas **unitarias** (objetivo, denylist, repetición, PII) corren en
   milisegundos, sin red ni LLM.
2. Una corrida **real** con presupuesto de 3 llamadas y save_lead vetado:
   observás el corte por presupuesto y que no se persista nada.

---

## 8. Checklist "¿lo entendí?"

- [ ] Puedo separar una valla **frontal** (objetivo, budget, tool) de una de
      **salida** (PII).
- [ ] Sé por qué las vallas NO usan el LLM (son deterministas).
- [ ] Entiendo la "huella" de repetición (tool + args) y por qué `fetch_page`
      de dos URLs distintas no es repetición.
- [ ] Sé en qué momento de `run()`/`loop` se consulta cada valla.
- [ ] Corrí `npm run guards:test` y vi el corte por presupuesto y el tool vetado.

---

**Siguiente fase (roadmap):** Aprobación humana (human-in-the-loop) — que el
agente PAUSE antes de una acción crítica y pida OK a una persona.