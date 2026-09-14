# FASE 2 — Que el agente LEER páginas web (el tool `fetch_page`)

> Explicado con peras y manzanas, para un junior.
> Ya sabés hablar con el modelo (Fase 1). Ahora le damos OJOS para leer.

---

## 1. La gran idea

En la Fase 1, el agente podía **hablar** con el modelo. En el Milestone 1,
le dimos **manos**: `search_google` (buscar). En esta fase le damos **ojos**:
`fetch_page` (abrir una página y leerla).

Pensalo así:

```
  AGENTE (el modelo)                    EL MUNDO REAL
  +------------------+                  +-----------------------------+
  |  Piensa y decide |                  |  internet                   |
  +------------------+                  |  (mil páginas de HTML)      |
         |                              +-----------------------------+
         |   "necesito leer esa página"          |
         |-------------------------------------->|
         |               search_google devuelve  |  TÍTULO + URL + trocito
         |               títulos y URLs          |
         |<--------------------------------------|
         |                                       |
         |   "ahora la abro y leo el texto"      |
         |-------------------------------------->|
         |               fetch_page devuelve     |  texto legible + links
         |<--------------------------------------|
         v
  +----------------------------------------------------------+
  |  Ahora SÍ puede analizar y responder con contenido real  |
  +----------------------------------------------------------+
```

**El problema que resuelve:** una página web es HTML, que es un DESASTRE
para leer (etiquetas, scripts, navegación, publicidad...). Si le dieras el
HTML crudo al modelo, gastaría tokens en basura y se confundiría.
`fetch_page` lo transforma en **texto limpio** antes de dárselo.

---

## 2. Mapa del territorio

```
src/
  tools/
    website.ts        <- TODO lo nuevo de esta fase
  smoke/
    website.ts        <- la prueba del tool sola (apretás el botón)
    agent.ts          <- ahora registra search_google + fetch_page
package.json          <- nuevo script: npm run website:test
```

---

## 3. El jugador nuevo — `website.ts`

Un archivo con 3 piezas: **limpiar HTML**, **sacarle los datos útiles** y
**el tool** que las une.

### Pieza 1 — `htmlToText()` : el "pelapapas"

Imaginate que el HTML es una **naranja**: hay que sacarle la cáscara
(scripts, estilos, etiquetas) para quedarte con el gajo (el texto real).

```
  HTML crudo                          htmlToText()                     Texto limpio
  +--------------------------+        +------------------+        +-----------------+
  | <div class="menu">       |        |  borra <script>  |        | "Agencia de     |
  |   <script>dolor.js</script> | ---> |  borra <style>   |  --->  |  diseño web     |
  |   <h1>Título</h1>        |        |  borra etiquetas |        |  Título         |
  | </div>                   |        |  acomoda espacios |        |  ...            |
  +--------------------------+        +------------------+        +-----------------+
```

**En criollo:** tira todo lo que el humano no leería y deja solo las palabras.

### Pieza 2 — los extractores

Tres helpers chiquitos que pescan datos puntuales del HTML:

| Helper | Qué agarra | Ejemplo |
|--------|------------|---------|
| `extractTitle` | el `<title>` de la pestaña | "Agencia de Diseño Web n°1 en México" |
| `extractDescription` | la meta description | "Líder en diseño web... +20 años" |
| `extractLinks` | todos los hrefs de `<a>` | ["/diseno-web/", "https://..."] |

### Pieza 3 — `fetchPage()` : el que viaja a buscar la página

El flujo interno:

```
  1. VALIDAR           2. BAJAR           3. LEER            4. LIMPIAR
  +----------+         +--------------+   +--------------+   +---------------+
  | url      |  ---->  | fetch(url)   |-> | bytes ->     |-> | htmlToText()  |
  | http(s)? |         | user-agent   |   | texto (con   |   | (cáscara a    |
  |          |         | timeout 20s  |   | charset      |   |  basura)      |
  +----------+         +--------------+   | detectado)   |   +---------------+
                                          +--------------+
                                                       |
                                         +------------v------------+
                                         |  ACOTAR: si el texto     |
                                         |  es gigante, lo corto    |
                                         |  a N caracteres (tokens) |
                                         +-------------------------+
```

### El tool — `createWebsiteTool()`

```
  name:      fetch_page
  input:     { url, max_chars? }
  output:    { url, title, description, text, links, truncated }
  o si falla: { error: "No se pudo leer la página: ..." }
```

**En criollo:** el tool es el "traductor entre el agente y `fetchPage()`".
Le da al modelo una receta clara (`url`), ejecuta, y le devuelve la comida
ya servida o el aviso de "no hay plato".

---

## 4. Un paseo por una llamada real

**Lo que decide el agente (JSON):**

```json
{ "kind": "tool", "tool": "fetch_page", "args": { "url": "https://buenosairesit.com/", "max_chars": 3000 } }
```

**Lo que devuelve el tool (recortado):**

```json
{
  "url": "https://buenosairesit.com/",
  "title": "Agencia de Diseño y Desarrollo Web número 1 en México",
  "description": "Líder en Diseño y Desarrollo Web en México...",
  "text": "Agencia de Diseño y Desarrollo Web número 1 en México\nServicios\nDiseño Web\nGeneramos soluciones globales...",
  "links": ["https://buenosairesit.com/diseno-web/", "..."],
  "truncated": true
}
```

**Lo que hace el agente después:** lo lee, lo resume, y decide si ya
puede responder (`kind: final`) o necesita seguir investigando.

---

## 5. Las decisiones que importan (y por qué)

| Decisión | Por qué |
|----------|---------|
| Tirar `<script>`/`<style>`/`<head>` | El modelo no necesita JavaScript: solo el texto que lee un humano. |
| **Truncar** el texto a `max_chars` | Cada carácter = tokens. Una página gigante te quema el presupuesto Y la ventana de contexto. Mejor un texto acotado que uno gigante inmanejable. |
| `timeout` de 20s | Una página que no responde no debe congelar al agente para siempre. |
| Detectar `charset` | Las páginas "accentuadas" (ñ, á, é) en otro encoding se verían rarísimas; se detecta y decodifica bien. |
| Validar `http(s)` y devolver `{error}` | Si la URL es basura o no es HTML, en vez de reventar todo, se le avisa al agente para que recalcule. |

---

## 6. Cómo lo pruebo

```bash
# 1) Probar el tool solo, con una página real
npm run website:test -- "https://buenosairesit.com/" 3000

# 2) Probar el agente completo (busca + abre + resume)
npm run agent:test
```

---

## 7. Checklist "¿lo entendí?"

- [ ] Puedo explicar por qué NO le damos HTML crudo al modelo.
- [ ] Sé qué hace `htmlToText` y qué tira.
- [ ] Sé qué devuelve `fetch_page` y para qué sirve `truncated`.
- [ ] Entiendo por qué el tool devuelve `{error}` en vez de tirar una excepción.
- [ ] Corrí `npm run website:test` y `npm run agent:test` y vi al agente leer una página.

---

**Siguiente fase (ya con ojos y manos):** Qualification — criterios para
que el agente pase de "encontré una empresa" a "ESTE es un lead calificado".