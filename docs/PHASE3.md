# FASE 3 — Juzgar si un hallazgo es un lead calificado (motores `qualify_lead`)

> Explicado con peras y manzanas, para un junior.
> Ya el agente habla (F1), busca y lee (F2). Ahora aprende a DECIDIR si algo vale o no.

---

## 1. La gran idea

Buscar y leer está muy lindo, pero... ¿cómo sabe el agente si lo que encontró
**es lo que estás buscando**? Ahí entra la **calificación de leads**.

Pensalo como un **examen con rúbrica**:

```
  CANDIDATO (empresa)              RÚBRICA (criterios)             VEREDICTO
  +-----------------------+         +------------------------+      +----------+
  | Buenos Aires IT       |         |  ¿Ubicación? Buenos     |      |  SÍ      |
  | diseño web, ecommerce | ------->|    Aires               |----->|  76/100  |
  | SEO, apps, BA         |         |  ¿Servicios? diseño web |      |  lead OK |
  +-----------------------+         |  ¿Keywords? SEO         |      +----------+
```

El motor anota contra la rúbrica, suma puntos, y dice **sí / quizás / no**.
No es opinión: es un puntaje con motivos reproducibles.

**Por qué un motor y no "que el modelo opine":** el modelo puede ser
inconsistente (hoy bien, mañana mal, a veces inventa). Si la nota sale de
reglas, es **transparente**: sabés exactamente POR QUÉ un candidato pasó o no.

---

## 2. Mapa del territorio

```
src/
  qualification/
    types.ts       <- las definiciones: criterios, perfil del candidato, veredicto
    engine.ts      <- el motor de puntaje (las reglas)
  tools/
    qualify.ts     <- el tool qualify_lead (el puente entre agente y motor)
  core/
    agent.ts       <- ahora recibe "criteria" y los mete en el system prompt
  smoke/
    qualify.ts     <- la prueba: motor + agente completo
package.json        <- nuevo script: npm run qualify:test
```

---

## 3. Las piezas

### Pieza 1 — `types.ts` : la rúbrica y el examen

Dos "formularios":

**Los criterios** (lo que VOS buscás):

```ts
{
  label: "Agencia de diseño y desarrollo web en Buenos Aires",
  locations: ["buenos aires", "caba"],
  services:  ["diseño web", "desarrollo web", "e-commerce", "landing pages"],
  keywords:  ["seo", "aplicaciones", "posicionamiento"],
  minScore:  60          // nota de aprobación
}
```

**El candidato** (lo que hay que evaluar):

```ts
{
  name: "Buenos Aires IT",
  url: "https://buenosairesit.com/",
  location: "Buenos Aires",
  description: "Agencia de diseño web ... SEO ... e-commerce ..."
}
```

**El veredicto** (el resultado):

```ts
{
  result: "sí",          // | "no" | "quizás"
  score: 76,             // de 0 a 100
  reasons: ["Coincide la ubicación buscada: buenos aires", ...],
  matched: ["diseño web", "seo", ...]   // qué términos exactos acertaron
}
```

### Pieza 2 — `engine.ts` : la rúbrica con puntajes

El examen está repartido en 3 bloques:

```
  UBICACIÓN        SERVICIOS        + INDUSTRIAS/
  (hasta 25)       (hasta 35)         PALABRAS CLAVE
                                     (hasta 40)

  ¿menciona        ¿cuántos de tus     ¿cuántos términos
  "buenos aires"?  servicios           de esa lista
  si => 25 pto     aparecen?           aparecen?
  no => 0           pto = 35 * (aciertos/total)   ...
```

Luego:

```
  nota = ubicación + servicios + resto   (tope 100)

   nota >= 60        -> "sí"
   nota >= 60 * 0.7  -> "quizás"
   si no             -> "no"
```

**Un detalle fino:** antes de comparar, el motor **normaliza** el texto:
pasa todo a minúsculas y le saca los acentos ("Buenos Aires" -> "buenos
aires"). Así "Álvarez" y "alvarez" son lo mismo y no perdés candidatos por
una tilde.

### Pieza 3 — `tools/qualify.ts` : el tool

```
  name:      qualify_lead
  input:     { name, url?, location?, description }
  output:    { profile, verdict }
  el motor:  usa los CRITERIOS FIJOS que se le dieron al tool al crearlo
```

**En criollo:** el tool es Neutro Juez que ya tiene la rúbrica grabada.
Al agente solo le pide los datos del candidato, y le devuelve la nota.

### Pieza 4 — `agent.ts` modificado

El `Agent` acepta `criteria` en su config. Si existen, los agrega al
**system prompt** como reglas obligatorias e instruye:

```
  "Calificá cada candidato con qualify_lead antes de responder.
   Reportá solo leads calificados (sí o quizás) y explicá por qué."
```

Así el agente SABE que su trabajo es calificar, y tiene el tool a mano.

---

## 4. Un paseo por una llamada real

**El agente decidió (turno 3):**

```json
{
  "kind": "tool",
  "tool": "qualify_lead",
  "args": {
    "name": "Buenos Aires IT",
    "url": "https://buenosairesit.com/",
    "description": "Líder en Diseño y Desarrollo Web en Buenos Aires. Nuestra especialidad son el diseño web, desarrollo web, e-commerce, landing pages, SEO y aplicaciones..."
  }
}
```

**El motor respondió:**

```json
{
  "verdict": {
    "result": "sí",
    "score": 76,
    "reasons": [
      "Coincide la ubicación buscada: buenos aires.",
      "Servicios que coinciden: diseno web, desarrollo web, e-commerce, landing pages (4/4).",
      "Industrias/palabras clave que coinciden: seo, aplicaciones."
    ]
  }
}
```

**El agente lo usó para su respuesta final**, explicando el porqué con la
evidencia recogida. (Mientras tanto, una zapatería de Córdoba sacó 0/100
y quedó afuera.)

---

## 5. Las decisiones que importan (y por qué)

| Decisión | Por qué |
|----------|---------|
| **Motor determinístico** (reglas) en vez de "opinión libre" del modelo | Reproducible y auditable: mismo candidato = misma nota, siempre. |
| El modelo **orquesta**, no califica solo | El LLM decide qué candidate y cuándo usar el tool; el veredicto es objetivo. |
| `normalize()` (minúsculas + sin acentos) | Comparaciones justas; "Córdoba" != "cordoba" no debería reprobar a nadie. |
| Umbrales por puntaje (`minScore` y 70% de él) | Un solo rango da notas al límite; el `quizás` captura el "raya límite". |
| Los criterios viajan en el **system prompt** | El agente "recibe el encargo" explícito y no adivina qué buscás. |
| `matched` devuelve los términos exactos | Podés auditar: "¿por qué 76? Porque aparecieron estos 6 términos." |

---

## 6. Cómo lo pruebo

```bash
# 1) Ver el motor determinístico + el agente completo
npm run qualify:test

# 2) El resto, por si querés revisar todo
npm run llm:test
npm run website:test
npm run agent:test
```

---

## 7. Checklist "¿lo entendí?"

- [ ] Puedo explicar la diferencia entre "el modelo califica" y "el motor califica".
- [ ] Sé cuánto vale cada bloque del puntaje (ubicación/servicios/resto).
- [ ] Sé qué significa `minScore` y qué pasa con la nota a mitad de camino.
- [ ] Entiendo para qué sirve `normalize()`.
- [ ] Corrí `npm run qualify:test` y vi un SÍ y un NO con sus motivos.

---

**Siguiente fase:** Persistence/state — guardar los leads calificados en
SQLite para que no se pierdan y el agente pueda retomar.