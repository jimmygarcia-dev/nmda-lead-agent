# NMDA Lead Agent — Contexto de inicio

> Proyecto nuevo, independiente del repo Python `lead-extractor`.
> Este documento traslada la conversación y decisiones tomadas antes de
> inicializar este proyecto. Objetivos, fases y filosofía: ver
> `C:\Users\menikmati\Downloads\NMDA Lead Agent — Roadmap de Sistema Agéntico.md`
> (fuente autoritativa).

---

## 1. Qué es este proyecto

Reconstruir el concepto de "Lead Extractor" como un **sistema agéntico real**
aprendido desde cero: el agente debe interpretar un objetivo, planear, llamar
tools, observar resultados y decidir de nuevo (`think → decide → act → observe`).

- **NO** se usa un framework de agentes (ni LangChain, LangGraph, CrewAI, AutoGen).
- Distinción clave: `prompt → LLM → respuesta` es una app de LLM; un loop con
  tools/estado/resultado es lo que este proyecto construye.

## 2. Stack acordado

- Node.js + TypeScript (ESM, Node 20+).
- LLM: Ollama local, con interface propia (`LLMProvider`) para poder cambiar
  a OpenAI/Anthropic/DeepSeek después sin tocar el core.
- Búsqueda: primero sin API de pago; capa abstraída (provider intercambiable).
- Base de datos: SQLite en la primera etapa (aún no instalar).
- MCP, scheduler, memoria: MÁS ADELANTE (fases posteriores).

## 3. Orden de implementación (no saltarse)

1. PHASE 1 — `LLMProvider` interface + `OllamaProvider` + smoke test
2. PHASE 2 — Agent core + tipos (Agent, AgentContext, AgentMessage, Response, Config)
3. PHASE 3 — Tool registry + primer agent loop
4. Tool `search_google` (la más importante de la milestone 1)
5. Milestone 1 = "It can act": user → agent → Ollama → decide → search → analyze → final answer
6. Después: website tools, qualification, persistence/state, memory, MCP, scheduler,
   observability, guardrails, human-approval, multi-agent, production.

## 4. Decisión tomada (análisis previo a la creación)

El roadmap fue analizado contra el repo Python `lead-extractor`:

- Gran parte de las fases ya existen en Python (provider LLM, tools, state,
  persistence, observabilidad, guardrails, review humano, multi-agente en forma
  determinística). Ese repo sigue su curso con el trabajo pendiente del Lead Search
  v2.2 (sin commitear) y NO se mezcla con este proyecto.
- Lo que este proyecto aporta de nuevo: **agent loop dirigido por LLM** (tool
  calling real), memoria long-term/episódica, MCP, scheduler.
- Por eso se eligió un proyecto y repo separados.

## 5. Estructura inicial acordada

```
nmda-lead-agent/
├── src/
│   ├── llm/
│   │   ├── LLMProvider.ts
│   │   ├── types.ts
│   │   └── OllamaProvider.ts
│   ├── core/
│   │   ├── agent.ts
│   │   └── loop.ts
│   ├── tools/
│   │   ├── registry.ts
│   │   └── searchGoogle.ts
│   └── smoke/
│       ├── llm.ts          # npm run llm:test
│       └── agent.ts        # npm run agent:test
├── .env.example            # OLLAMA_HOST, OLLAMA_MODEL
├── tsconfig.json
└── package.json
```

## 6. Aprendizajes del entorno que aplican aquí

- Ollama corre en `http://localhost:11434` en esta máquina; modelos instalados:
  `qwen2.5:7b` (listo, cumple `format=json`/schema), qwen3.5 (modos thinking,
  NO cumplen bien el JSON estricto → para structured output usar qwen2.5).
- Búsqueda gratis: **Bing HTML y DuckDuckGo devuelven basura o vacío hoy**
  (Bing ignora comillas, DDG bloquea). Lo único gratis fiable probado es el
  **RSS de Bing** (`https://www.bing.com/search?format=rss&q=...`), que devuelve
  URLs limpias (parsear `<item>` → title/link/description). Sin `lxml` en este
  stack; en TS se parsea con `xml2js` o regex/`node:xml` si está disponible.
- Serper/Brave requieren API key (en `.env` de lead-extractor están vacías);
  dejarlos como providers opcionales.
- JSON estricto con Ollama: usar el parámetro `format` con el schema (chat o
  generate) y temperatura 0; qwen2.5:7b lo cumple.
- Numérico inyección: si el contenido de la respuesta del modelo viene dentro de
  ```` ```json ```` fences, limpiarlo antes de `JSON.parse` (fallo visto la fecha).

## 7. Checklist de inicialización local

```bash
git init
npm init -y
npm i -D typescript tsx @types/node dotenv
npx tsc --init   # module ESNext, moduleResolution bundler, target ES2022, strict
npm run llm:test     # PHASE 1
npm run agent:test   # Milestone 1
```

## 8. Pendientes en lead-extractor (NO tocar desde aquí)

- Lead Search v2.2 (app.js/index/styles) sin commitear en
  `feature/mission-config-v1.2`; incluye `src/discover.py` y `rh` en
  `VALID_LINES` de `campaign_context_service.py`.
- El usuario commitea/o decide esos cambios en ese repo.