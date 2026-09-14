# LEARNING ROADMAP — NMDA Lead Agent

Recorrido de aprendizaje desde la Fase 1 hasta la Fase 11 (cierre del tema
"agente por consola"). Método por fase: **leer el código del módulo, correr su
smoke y hacer el mini-ejercicio**. Las ramas `phase/N-*` y los tags `phase-N`
conservan cada fase tal como quedó.

---

## A) Repaso por fase (1 → 10)

| Fase | Qué se aprende | Leer | Smoke | Mini-ejercicio |
|---|---|---|---|---|
| 1. LLM Provider | Dependencia invertida: el core no conoce a Ollama; `LLMProvider.chat` es el único contrato. JSON estricto vía `format=schema` (propio de Ollama) | `src/llm/LLMProvider.ts`, `types.ts`, `OllamaProvider.ts` | `npm run llm:test` | Mandar un mensaje crudo a `chat()` sin schema y ver cómo improvisa |
| 2. Website | Convertir HTML real a texto limpio y acotado (`max_chars`) para no quemar contexto | `src/tools/website.ts` | `npm run website:test` | Cambiar el límite de caracteres y reintentar |
| 3. Qualification | Motor determinístico (sin LLM) de puntaje por criterios/locations/services | `src/qualification/engine.ts`, `types.ts` | `npm run qualify:test` | Crear un criterio propio (ej. "cafetería de especialidad") |
| 4. Persistencia | SQLite con `node:sqlite`, WAL, unicidad, `save_lead` dentro del loop | `src/persistence/store.ts` | `npm run persist:test` | Agregar una columna y migrar filas viejas |
| 5. Memoria | Recuperar historial + leads e **inyectarlo en el system prompt** antes del turno 0 | `src/memory/memory.ts` | `npm run memory:test` | Entrar, pedir "¿qué ya viste?", salir y reentrar con otra sesión |
| 6. MCP | JSON-RPC 2.0 sobre stdio: un proceso aparte sirve tools; el cliente los convierte a registry local | `src/mcp/server.ts`, `client.ts`, `protocol.ts` | `npm run mcp:test` | Agregar un tool propio al servidor MCP |
| 7. Scheduler | Cron propio (parser + `isDue`), jobs en SQLite, loop liviano que dispara al agente | `src/scheduler/cron.ts`, `scheduler.ts`, `jobStore.ts` | `npm run scheduler:test` | Configurar un job `*/1 * * * *` y observar ticks |
| 8. Observabilidad | Observer (eventos) + Tracer (spans OTel-style) + Metrics sin tocar la lógica del loop | `src/observability/tracer.ts`, `metrics.ts`, `types.ts` | `npm run obs:test` | Renderizar el árbol de spans en texto |
| 9. Guardrails | Políticas: objetivo bloqueado, presupuesto LLM/tiempo, denylist, repetición, redactar PII | `src/guardrails/guardrails.ts` | `npm run guards:test` | Agregar un pattern de objetivo y un tool al denylist |
| 10. Aprobación humana | Human-in-the-loop: `ApprovalGate` frena `save_lead` y comunica el rechazo como paso legible | `src/approval/`, valla en `src/core/loop.ts` | `npm run approval:test` | Correr `NMDA_APPROVAL=1 npm run chat` y rechazar a mano |
| Milestone | El loop completo `think→decide→act→observe` integrado | `src/core/loop.ts`, `agent.ts`, `smoke/agent.ts` | `npm run agent:test`, `npm run chat` | Darle un objetivo de punta a punta por consola |

---

## B) Fase 11 — Conectar cualquier API (DeepSeek primero)

`LLMProvider.chat()` (`src/llm/LLMProvider.ts`) es lo único que conoce el agente.
Ollama impone decisiones estrictas con `format=schema`; DeepSeek/OpenAI usan
otra forma. Implementar un provider nuevo = aprender a portar cualquier API.

Pasos:
1. **DeepSeekProvider** (`src/llm/DeepSeekProvider.ts`): implementar `LLMProvider`
   con `fetch(baseUrl + /chat/completions)`, header `Authorization: Bearer $DEEPSEEK_API_KEY`.
2. **Adaptar JSON estricto**: DeepSeek no recibe el schema → usar
   `response_format: { type: 'json_object' }` (fuerza JSON válido, no el schema).
3. **Function calling real**: `ChatOptions.tools` y `ChatResult.toolCalls`
   (tipos ya preparados en `src/llm/types.ts`) → mapear `tools` al formato OpenAI.
4. **Selector por env**: `LLM_PROVIDER=ollama|deepseek` vía factory
   (`src/llm/providerFactory.ts`), usado por `npm run chat`.
5. **Validación**: `npm run chat` con ambos providers y comparar tool-calling,
   calidad y `usage` en tokens (ya tipado en observability).

---

## C) Criterio de "concluido"

- [ ] `LLM_PROVIDER=deepseek npm run chat` hace el recorrido completo
      (search → fetch → qualify → save) con DeepSeek.
- [ ] El mismo recorrido sigue funcionando con `LLM_PROVIDER=ollama`.
- [ ] `docs/PHASE11.md` documenta el swap de provider y las diferencias de
      structured output entre Ollama y OpenAI-compatible.

---

## D) Fase 11b — Router de modelos (local para loop, calidad para email/valoración)

Regla de oro para una máquina con 6 GB de VRAM: **no usar un solo modelo grande
para todo**. El loop y la extracción son tareas baratas (local); el email y la
valoración exigen mejor modelo.

- `LLMRouter` (`src/llm/LLMRouter.ts`): implementa `LLMProvider`; según
  `ChatOptions.route` manda la llamada al provider **default** (local) o al de
  **quality** (DeepSeek). Sin key, cae al default: mismo modelo para todo.
- `write_email` (`src/tools/writeEmail.ts`) y `value_page`
  (`src/tools/valuePage.ts`): tools LLM que llaman por la ruta qualité (JSON
  estricto {subject, body} y {verdict, score, strengths, weaknesses}).
- `createRoutedProvider()` (`src/llm/providerFactory.ts`): arma el router desde
  `.env`; `DEEPSEEK_API_KEY` presente = calidad DeepSeek, ausente = fallback local.
- Smoke: `npm run router:test` (ruteo/fallback determinista, sin red) y
  `npm run email:test` (tools reales contra el modelo local).
- CLI: `npm run chat` ya usa el router y muestra la ruta de calidad en el banner.

Después de esto quedan los escalones optativos del roadmap original:
**multi-agente** y **producción**.