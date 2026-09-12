# PHASE 10 — Aprobación humana (human-in-the-loop)

> Analogía: un agente autónomo es un **copiloto con la mano en el teclado**. La
> aprobación humana es el **freno de mano del instructor**: cuando el copiloto va
> a hacer algo "quemado" (escribir a la base, enviar un mail, gastar plata),
> el instructor decide si deja pasar o no. En vez de código escondido, la regla
> vive en el **bucle mismo**: `pensar → decidir → [¿me dejan?] → actuar`.

## Qué se agregó

```
src/approval/
├── types.ts             # ApprovalContext, ApprovalDecision, HumanApprover, ApprovalGate
├── consoleApprover.ts   # pausa y pregunta "s/N" por stdin (humano real)
└── scriptedApprover.ts  # cola de respuestas (tests/smokes: simula al humano)
```

Y una **valla en el loop** (`src/core/loop.ts`), que chequea la aprobación *antes*
de ejecutar un tool, siempre que ese tool esté en `gate.requiredTools`:

```
¿aprueba el humano?   ─ ─ no ─ ─▶  no se ejecuta; error al modelo:
                                   "aprobación humana rechazada: <nota>"
                          │
                          sí
                          ▼
                 se ejecuta el tool
```

Se repite el patrón de guardrails (fase 9): la decisión llega al modelo como
un **paso con error legible**, y el agente decide qué hacer con eso. La persona
nunca toca el código; el sistema le pregunta.

## Cómo se usa (código)

```ts
const agent = new Agent(provider, registry, {
  ...
  approval: {
    approver: new ConsoleApprover(),          // humano real (stdin)
    requiredTools: ['save_lead'],             // tools que piden visto bueno
  },
});
```

- `requiredTools = []` ⇒ puente directo (el mismo sistema sin freno).
- `ConsoleApprover` muestra `renderPrompt(ctx)` y espera `s/N`. Para no frenar la
  UI, `renderPrompt` es **público**: la UI lo muestra sin esperar la respuesta.
- `ScriptedApprover` devuelve decisiones precargadas en orden (y ante un agotamiento,
  **deniega** por defecto – fail closed).

## Por qué "peras y manzanas" (decisiones de diseño)

| Pregunta                    | Opción A (pan nuestro)      | Opción B (freno real)      | Elegido          | Por qué |
| --------------------------- | --------------------------- | -------------------------- | ---------------- | ------- |
| ¿Dónde vive la regla?       | En el tool (siempre bloquea)| En el loop (gate de config)| **Loop + gate**  | La misma `save_lead` puede exigir OK o no según la misión; no se mezcla permisos con lógica |
| ¿Quién pregunta?            | El agente "por su cuenta"   | Una entidad explícita `HumanApprover` | **`HumanApprover`** | Intercambiable: consola hoy, UI/WhatsApp/Telegram mañana, sin tocar el core |
| ¿Qué tools piden OK?        | Todos                      | Los críticos de riesgo alto | **Solo los listados** | Cotidiano no debe frenarse; los "quemados" sí |
| ¿Ante una cola agotada?     | Aprobar (fail open)         | Denegar (fail closed)      | **Denegar**      | En un humano simulado, silencio = no; mejor no escribir sin orden |
| ¿Cómo se comunica el veto?  | Excepción cruda             | Paso de loop con error legible | **Paso con error** | El modelo lee el motivo y así aprende/discute; no crashea la corrida |

## Checklist de la fase

- [x] `ApprovalGate` + `HumanApprover` tipados en `src/approval/types.ts`
- [x] `ConsoleApprover` (stdin, con `renderPrompt` público para UIs)
- [x] `ScriptedApprover` (cola de decisiones, fail-closed)
- [x] Valla en `runLoop` antes de ejecutar tools en `requiredTools` (mismo
      patrón `blockedReason` de guardrails)
- [x] `AgentConfig.approval` propagado de `Agent` a `runLoop`
- [x] Smoke `npm run approval:test`: muestra el prompt humano, una corrida con
      **veto** (0 leads) y otra con **visto bueno** (1 lead)
- [x] Typecheck y smoke en verde; `docs/PHASE10.md`

## Deuda técnica (consciente)

- La aprobación es **síncrona**: el loop queda en espera mientras el humano mira.
  Para uso real asíncrono (approve/deny desde otra pantalla), habrá que agregar
  un "resume" con `approval_id`, igual que MCP (fases posteriores).
- `ConsoleApprover` no distingue "no contestó" de "no": hoy todo `!= s/Si` es
  rechazo. Suficiente para la fase.

## Siguiente fase

**Multi-agente** (el roadmap original la coloca después de aprobación humana).