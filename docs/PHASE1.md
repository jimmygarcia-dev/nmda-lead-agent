# FASE 1 — Hablar con el modelo de IA (la ficha del enchufe)

> Explicado con peras y manzanas, sin dar nada por sabido.
> Objetivo: que un **junior** entienda qué hace la PHASE 1 y por qué está hecha así.

---

## 1. La gran idea

Imaginá que tu programa es **una casa** y el modelo de IA (Ollama) es **la central eléctrica**.

```
  TU PROGRAMA                          CENTRAL ELÉCTRICA (Ollama)
  +------------+                       +-----------------------+
  |  la casa   |                       | modelo qwen2.5:7b     |
  +------------+                       +-----------------------+
        |                                      |
        |      ¿cómo conectamos la casa        |
        |         a la central?                |
        v                                      v
```

Necesitás un **enchufe**: una pieza estándar que encaja en cualquier lado.

```
  +------------------------------------------------------------------+
  |                       EL ENCHUFE (LLMProvider)                    |
  |  Una plantilla: "chat(mensajes) -> respuesta"                     |
  |  No sabe nada de Ollama. Solo dice QUÉ se puede hacer.            |
  +------------------------------------------------------------------+
```

Pero el enchufe por sí solo no da luz. Hace falta la **instalación real** de tu casa:

```
  +------------------------------------------------------------------+
  |              LA INSTALACIÓN (OllamaProvider)                       |
  |  Sabe hablar con Ollama: arma el pedido, lo manda,                |
  |  recibe la respuesta y la convierte al idioma del enchufe.        |
  +------------------------------------------------------------------+
```

**La regla de oro:** la casa (tu programa) solo conoce el enchufe.
Si mañana querés cambiar de central eléctrica (OpenAI), cambiás
la instalación, **no la casa**.

---

## 2. Mapa del territorio

```
src/
  llm/
    types.ts          <- El vocabulario (qué son los mensajes, respuestas, tools)
    LLMProvider.ts    <- El enchufe (la interfaz / plantilla)
    OllamaProvider.ts <- La instalación (habla con Ollama de verdad)
  smoke/
    llm.ts            <- La prueba: apretás el botón y mira si hay luz
```

---

## 3. Los 3 jugadores (y la prueba)

### Jugador 1 — `types.ts` : Las palabras del idioma

**¿Qué es?** La definición de los datos que van a circular. Sin nombres raros
para el resto del programa.

| Tipo | Qué significa | Ejemplo de la vida real |
|------|---------------|-------------------------|
| `ChatMessage` | Un mensaje con quién lo dice y qué dice | "El modelo le dijo al programa: *buscá en internet*" |
| `ChatResult` | La respuesta redonda (texto + opcional tools + tokens) | "El modelo respondió: *estos son los resultados*" |
| `ToolCall` | "Usá tal herramienta con estos argumentos" | "Llamá a `search_google` con `{ query: '..." }`" |

**En criollo:** si no hubiera un idioma común, cada proveedor te devolvería
los datos a su manera y el agente no entendería a nadie.

---

### Jugador 2 — `LLMProvider.ts` : El contrato

**¿Qué es?** Una interfaz: *"todo el que se diga proveedor tiene que saber hacer esto"*.

```ts
interface LLMProvider {
  readonly name: string;
  chat(messages: ChatMessage[], options?): Promise<ChatResult>;
}
```

Leelo en voz alta: *"soy un proveedor, me llamo X, y si me das una lista de
mensajes, te devuelvo una respuesta (ChatResult)"*.

**En criollo:** es un **contrato de trabajo**. No dice Quién va a trabajar,
dice Qué trabajo hay que hacer. Cualquiera que firme el contrato
(Ollama, OpenAI, DeepSeek) puede ocupar el puesto.

---

### Jugador 3 — `OllamaProvider.ts` : El que trabaja de verdad

**¿Qué es?** La implementación que cumple el contrato. Acá vive la mugre:
cómo se habla con Ollama.

Flujo por dentro del método `chat()`:

```
  1. ARMAR el pedido                      2. MANDAR el pedido
  +---------------------------+           +-------------------------+
  | {                         |           |   POST /api/chat        |
  |   model: 'qwen2.5:7b',    |  -------> |   (fetch a Ollama)      |
  |   messages: [...],        |           +-------------------------+
  |   temperature: 0,         |                        |
  |   format: {jsonSchema}    |                        v
  | }                         |           +-------------------------+
  +---------------------------+           |  { message: {content}, |
                                          |   prompt_eval_count }  |
  +---------------------------+           +-------------------------+
  | {                         |                        |
  |   content: '...',         |   <-------             |
  |   usage: {...}            |  RECIBIR + CONVERTIR   |
  | }                         |                        |
  +---------------------------+                        v
       (ChatResult, idioma            +--------------------------------+
        del enchufe)                  |  "chat() devuelve ChatResult"  |
                                       +--------------------------------+
```

**En criollo:** Ollama habla *inglés de Ollama* (`message`, `prompt_eval_count`).
El `OllamaProvider` es el **traductor**: recibe eso y lo pasa a *inglés del
proyecto* (`content`, `usage`). Así el agente nunca ve la jerga de Ollama.

---

### La prueba — `smoke/llm.ts` : El botón de encendido

Un script chiquito que:

```
  levanta la config (.env)
        |
        v
  manda un "system" + un "user"
        |
        v
  imprime la respuesta y los tokens usados
```

**En criollo:** el interruptor para chequear que "hay luz".
Si lo corrés y ves texto del modelo, la PHASE 1 está terminada:

```bash
npm run llm:test
```

---

## 4. Un paseo por una llamada real (con JSON de verdad)

**Lo que manda la app** (el pedido que arma OllamaProvider):

```json
{
  "model": "qwen2.5:7b",
  "stream": false,
  "temperature": 0,
  "format": { "type": "object", "properties": { "answer": { "type": "string" } } },
  "messages": [
    { "role": "system", "content": "Sos un ayudante, respondé en una frase." },
    { "role": "user",   "content": "¿Qué es un lead calificado?" }
  ]
}
```

**Lo que devuelve Ollama** (la respuesta cruda):

```json
{
  "message": { "content": "Un lead calificado es un prospecto que cumple los criterios..." },
  "prompt_eval_count": 31,
  "eval_count": 58
}
```

**Lo que recibe tu programa** (ya traducido a `ChatResult`):

```ts
{
  content: "Un lead calificado es un prospecto que cumple los criterios...",
  usage: { promptTokens: 31, completionTokens: 58 }
}
```

Fijate: la app jamás ve `prompt_eval_count`. Esa es la magia de la capa.

---

## 5. Las 3 decisiones que importan (y por qué)

| Decisión | Por qué |
|----------|---------|
| `temperature: 0` | Para que el modelo responda lo "correcto", sin inventar. O sea: predecible. |
| `format` + `jsonSchema` | Le da una plantilla que RESPETAR. Sin esto, el modelo te devuelve cualquier formato (y a veces JSON con ``` alrededor). |
| Mapear la respuesta a `ChatResult` | Desacopla al resto del programa de los nombres propios de Ollama. |

---

## 6. Cómo lo pruebo

```bash
# 1) Ollama tiene que estar corriendo y tener el modelo
ollama list          # deberías ver qwen2.5:7b

# 2) configuras las variables (opcional, hay defaults)
cp .env.example .env

# 3) corrés la prueba de fase 1
npm run llm:test
```

---

## 7. Checklist "¿lo entendí?"

- [ ] Puedo explicar con mis palabras qué es una **interfaz** y qué es una **implementación**.
- [ ] Sé por qué el resto del programa no debe conocer a `OllamaProvider` por dentro.
- [ ] Sé qué hace `temperature: 0` y para qué sirve `format` con el schema.
- [ ] Sé cuál es el rol de `types.ts`, `LLMProvider.ts` y `OllamaProvider.ts`.
- [ ] Corrí `npm run llm:test` y vi una respuesta del modelo.

---

**Siguiente fase:** el agente (PHASE 2/3) usa `LLMProvider.chat()` sin saber
que atrás hay un Ollama. Eso es justamente el enchufe del principio.