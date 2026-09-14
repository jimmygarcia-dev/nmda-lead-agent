# FASE 6 — MCP: los tools se vuelven un SERVICIO aparte

> Explicado con peras y manzanas, para un junior.
> F1..F5: el agente usaba his herramientas "pegadas a él".
> Ahora las herramientas viven en OTRO proceso y se hablan por un protocolo estándar.

---

## 1. La gran idea

Hasta la Fase 5, los tools eran funciones dentro del mismo programa:

```
   ANTES                           +-------------- TU PROGRAMA --------------+
                                   |  agente  ->  loop  ->  tools (locales)  |
                                   +----------------------------------------+
```

En la Fase 6 los tools se van a vivir a **otro proceso**:

```
   AHORA
   +---------- TU PROGRAMA ----------+            +----- OTRO PROCESO --------+
   |  agente -> loop -> ToolRegistry |--- MCP --->|  ToolRegistry -> tools    |
   +---------------------------------+  over      +---------------------------+
                                        stdio
```

Lo importante NO es que sean dos procesos. Es que hablar entre ellos se hace
con **un protocolo estándar** (Model Context Protocol). Igual que HTTP es el
protocolo de la web, MCP es el protocolo de "le presto mis tools a otra app".

> **En criollo:** antes tus tools eran *parte de* tu programa. Ahora son un
> *servicio* al que cualquier programa (el futuro agente GUI, Claude, Cursor...)
> puede conectarse. El agente no sabe ni le importa dónde viven los tools:
> para él son "remote tools" idénticas a las locales.

---

## 2. El protocolo en una diapositiva

MCP habla **JSON-RPC 2.0**, mensajes de una línea por cada lado (newline-delimited).

```
Cliente ---(stdin del server)-->  Servidor
  { "jsonrpc":"2.0","id":1,"method":"initialize" }
  { "jsonrpc":"2.0","id":2,"method":"tools/list" }
  { "jsonrpc":"2.0","id":3,"method":"tools/call",
    "params": { "name":"search_google",
                "arguments": { "query":"agencia diseño web BA", "limit":3 } } }

Servidor ---(stdout del server)--> Cliente
  { "jsonrpc":"2.0","id":1,"result":{ "protocolVersion":"2024-11-05", ... } }
  { "jsonrpc":"2.0","id":2,"result":{ "tools":[ { "name":"search_google", ... } ] } }
  { "jsonrpc":"2.0","id":3,"result":{ "content":[ { "type":"text","text":"{...}" } ] } }
```

| Método | Pregunta que responde | Resultado |
|--------|----------------------|-----------|
| `initialize` | "¿Sos un server MCP? ¿Qué sabés hacer?" | protocolVersion + capabilities + serverInfo |
| `tools/list` | "¿Qué tools ofrecés?" | lista con nombre, descripción y esquema de input |
| `tools/call` | "Ejecutame este tool con estos argumentos" | resultado (texto JSON) o error |
| `ping` | "¿Seguís vivo?" | `{}` |

**Regla de oro de JSON-RPC:** cada request lleva un `id`; la respuesta devuelve
ESE MISMO id (así el cliente sabe a qué pedido contesta). Los mensajes SIN id
son notificaciones → no contestás.

---

## 3. Mapa del territorio

```
src/
  mcp/
    protocol.ts       <- tipos JSON-RPC 2.0 + constantes MCP (initialize, tools/list, ...)
    server.ts         <- McpToolServer: recibe líneas por stdin, contesta por stdout
    client.ts         <- McpClient (spawnea el server) + createRegistryFromMcp
    serverHost.ts     <- el proceso aparte: arma registry y levanta el server
  tools/
    host.ts           <- buildHostRegistry(store, memory): el set de tools "host" compartido
  smoke/
    mcp.ts            <- la prueba: protocolo + agente con tools remotos
package.json           <- nuevo script: npm run mcp:test
```

---

## 4. Las piezas

### Pieza 1 — `mcp/protocol.ts`: la "tabla del protocolo"

Tipos del JSON-RPC y las formas MCP (`McpToolSchema`, `McpToolCallResult`).

**Detalle fino que costó lo suyo:**
`RpcRequest` tiene `id` y `RpcNotification` NO. Como una interface con
propiedades "de más" es asignable a otra más chica, TypeScript colapsaba la
unión y no distinguía request de notification. Se arregla marcando
`id?: never` en la notification: ahora son tipos *excluyentes* de verdad.

### Pieza 2 — `mcp/server.ts`: el servidor (el "restorán")

```js
class McpToolServer {
  // start():  lee líneas de stdin, por cada una -> handleLine() -> escribe en stdout
  // handleLine(line):
  //   ¿parsea?  no -> error -32700
  //   ¿tiene id? no -> notificación, no contesto
  //   dispatch():
  //     initialize -> { protocolVersion, capabilities:{tools:{}}, serverInfo }
  //     tools/list  -> registry.list().map(...) con inputSchema
  //     tools/call  -> registry.execute(name, args) -> { content:[{type:'text',text:JSON}], isError }
  //     ping        -> {}
  //     otro        -> error -32601 (Method not found)
}
```

**En criollo:** es un "restorán": el cliente hace el pedido por la ventanilla
(stdin), el restauran cocina (ejecuta el tool) y entrega el plato por la otra
ventanilla (stdout). Un plato por pedido, identificado por el `id`.

### Pieza 3 — `mcp/client.ts`: el comensal

```js
class McpClient {
  // constructor(scriptPath): spawnea un proceso Node ajeno:
  //   spawn(process.execPath, [tsxCli, scriptPath], { stdio:['pipe','pipe','inherit'] })
  // request(method, params):
  //   asigna un id, guarda un "pendiente" {resolve,reject},
  //   escribe JSON + '\n' por stdin, y cuando llega la respuesta con el MISMO id,
  //   la resuelve.
  // initialize() / listTools() / callTool(name, args) / ping() / close()
}

async function createRegistryFromMcp(client): Promise<ToolRegistry>
```

`createRegistryFromMcp` es la magia del desacople: pide `tools/list`, y por
cada tool remoto registra uno local que, al ejecutarse, hace
`client.callTool(...)`. El agente NO nota la diferencia.

**En criollo:** el cliente es un "menú de delivery": le apuntás la direccion
del restaurán, él te muestra el menu (tools/list) y te trae lo que pidas
(tools/call). Para el agente es como ir al restaurán de siempre.

### Pieza 4 — `tools/host.ts`: el cocinero compartido

`buildHostRegistry(store, memory)` arma una vez el set de tools
(search_google, fetch_page, qualify_lead, save_lead, recall_memory).
Lo usan el `serverHost` (el proceso aparte) y los smokes. Evita que el
"host" se arme dos veces distinto en dos procesos.

### Pieza 5 — `mcp/serverHost.ts`: la entrada del proceso ajeno

```js
import 'dotenv/config';
const store = new LeadStore(process.env.LEAD_DB ?? 'data/leads.db');
const memory = new AgentMemory(store);
const registry = buildHostRegistry(store, memory);
await new McpToolServer(registry).start();
```

Todavía más simple que el smoke de siempre: **no tiene `main()`** — empieza a
esperar pedidos por stdin y listo. Vive solo.

---

## 5. Un paseo real (lo que imprime `npm run mcp:test`)

```
(1) Servidor MCP en proceso (protocolo):
  -> {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05",
       "capabilities":{"tools":{}},"serverInfo":{"name":"nmda-tools-local"}}}
  tools/list -> search_google, fetch_page, qualify_lead, save_lead, recall_memory

(2) Agente con tools servidos por un proceso MCP aparte:
  handshake con servidor externo: {"name":"nmda-lead-tools"} (protocolo 2024-11-05)
  tools remotos disponibles: search_google, fetch_page, qualify_lead, save_lead, recall_memory
  tools/call directo -> {"query":"agencia diseño web México","results":[...]}

  [turno 1] recall_memory({})                        -> ok  (ejecutado en el hijo)
  [turno 2] search_google(...)                       -> ok  (hijo)
  [turno 3] fetch_page("https://buenosairesit.com/") -> ok  (hijo)
  [turno 4] qualify_lead(...)                        -> 84/100 sí (hijo)
  [turno 5] save_lead(...)                           -> ok  (hijo)
  [turno 6] final

  --- leads persistidos (escritos por el proceso MCP, leídos desde acá) ---
  [2] SÍ 84/100 - México IT (...)
  [1] QUIZÁS 59/100 - Soporte Digital Labs (...)
```

Lo que hay que mirar:

- **Cada tool del agente se ejecutó en el proceso hijo.** (search, fetch,
  qualify y save corrieron en el servidor MCP, no en el proceso del agente.)
- **El lead lo escribió el hijo y lo leyó el padre**: mismo archivo SQLite,
  dos procesos. Eso ya lo aguantaba WAL desde la Fase 4.
- El LLM quedó en el padre; SOLO los tools viven afuera. Eso es exactamente
  la idea de MCP: se comparte la "mano" del agente, no su cabeza.

---

## 6. Las decisiones que importan (y por qué)

| Decisión | Por qué |
|----------|---------|
| JSON-RPC 2.0 con **líneas separadas por `\n`** | Simple, fire-and-forget, standard. |
| `id` en cada request → respuesta con el **mismo id** | El cliente sabe a qué pedido contestó. |
| Notificaciones sin id → **no contesto** | Regla JSON-RPC; evita respuestas fantasma. |
| El resultado del tool viaja como **texto JSON** | Igual que ya hacíamos en el loop; el wire es texto. |
| El cliente spawnea el server con `tsx` | Mismo repo, mismo runtime; en prod sería otro binary. |
| `createRegistryFromMcp` → `ToolRegistry` | El agente NO sabe si el tool es local o remoto: desacople total. |
| Server y cliente **cada uno con su `ToolRegistry`** | Cada lado es autónomo; el protocolo está en el medio. |
| `id?: never` en `RpcNotification` | Sin eso TS colapsa la unión y pierde la discriminación request/notification. |

---

## 7. Cómo lo pruebo

```bash
npm run mcp:test
```

El smoke:
1. Le manda `initialize` y `tools/list` a un servidor **en proceso** (muestra el protocolo crudo).
2. Spawnea un **proceso aparte** (`serverHost.ts`), hace handshake, lista tools.
3. Corre un `tools/call` directo.
4. Levanta un agente cuyo registry viene **100% del servidor remoto** y lo deja trabajar.
5. Al final lista los leads escritos por el hijo y leídos por el padre.

---

## 8. Checklist "¿lo entendí?"

- [ ] Puedo explicar qué es MCP con una analogía (restorán/delivery/plugs).
- [ ] Sé cuáles son los tres métodos MCP que implementamos y qué devuelve cada uno.
- [ ] Entiendo para qué sirve el `id` en JSON-RPC.
- [ ] Sé por qué una notificación NO espera respuesta.
- [ ] Entiendo cómo `createRegistryFromMcp` "disfraza" tools remotos de locales.
- [ ] Corrí `npm run mcp:test` y vi que los tools corrieron en el proceso ajeno.

---

**Siguiente fase:** Scheduler — el agente no solo contesta, agenda y ejecuta
tareas solas (o en el roadmap: observabilidad / guardrails / aprobación humana).