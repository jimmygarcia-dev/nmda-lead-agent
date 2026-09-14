# CLI interactivo — `npm run chat`

Modo interactivo donde el agente **Underdog** espera un objetivo por consola, lo
ejecuta con el stack completo y queda esperando el siguiente. La base persiste
entre sesiones en `data/cli.db`.

## Uso

```bash
npm run chat
```

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Underdog — NMDA Lead Agent (modo interactivo)
  provider: router — qwen3:8b | deepseek-chat
  tools:  search_google, fetch_page, qualify_lead, save_lead, recall_memory,
          export_leads_csv, write_email, value_page
  base:   data/cli.db (0 lead(s))

╭ objetivo
╰ <escribí tu objetivo y Enter>
```

El agente imprime cada paso como una tarjeta (`✓ search_google …`), muestra un
spinner mientras decide y **transmite la respuesta final en vivo** (streaming).
Al terminar queda a la espera del próximo objetivo, con la memoria (y los leads
guardados) de la misma sesión.

### Identidad
El agente se llama **Underdog** y su voz está definida en el `persona` del config
(`src/cli/index.ts`, `PERSONA_UNDERDOG`): directo, cordial y sin inventar datos.
La identidad se inyecta en el system prompt, no cambia el loop.

### Primer uso
Si la base está vacía, arranca con **onboarding**: tres objetivos de ejemplo para
copiar y una nota sobre la sesión.

## Multi-turno (sesión)

Dentro de la misma sesión del CLI, cada objetivo **concluido** se resume y se
inyecta como contexto al siguiente pedido. Así podés encadenar:

```
╭ objetivo        →  buscá agencias de diseño web en México
╭ objetivo        →  ahora armale un email a la que calificaste mejor
```

El agente ya "sabe" qué buscó, calificó y guardó en la vuelta anterior (por el
resumen de la sesión) sin repetir el contexto. El bucle interno de cada
objetivo (`think → decide → act`) no cambia; solo se antecede el contexto.

El límite es de 8 resúmenes por sesión (lo más viejo se descarta). El comando
`nuevo` reinicia el contexto de la sesión (no borra leads).

## Comandos dentro del chat

| Comando  | Efecto |
| -------- | ------ |
| `leads`  | Lista los leads guardados hasta ahora |
| `nuevo` / `new` / `reset` | Reinicia el contexto de la sesión (deja de recordar pedidos anteriores) |
| `ayuda` / `help` | Vuelve a mostrar el banner con opciones |
| `salir` / `exit` / `quit` / `chau` / `:q` / `done` | Cierra el chat |

## Variables de entorno

| Variable | Default | Efecto |
| -------- | ------- | ------ |
| `NMDA_DB` | `data/cli.db` | Ruta del archivo SQLite (historial + leads) |
| `NMDA_MAX_TURNS` | `10` | Máximo de turnos de agente por objetivo |
| `NMDA_APPROVAL` | desactivada | `1` activa la aprobación humana: el agente pide OK por consola antes de `save_lead` |
| `NMDA_STREAM` | `1` | `0` desactiva el streaming de la respuesta final (todo se imprime al terminar) |
| `NO_COLOR` | «» | definido, apaga los colores en la salida |

```bash
NMDA_APPROVAL=1 NMDA_MAX_TURNS=6 npm run chat
```

## Notas

- Todo lo que el agente guarda como lead vive en la DB indicada por `NMDA_DB`;
  `search_google` usa el provider de `SEARCH_PROVIDER` (default DuckDuckGo) y
  el LLM es el de `OLLAMA_HOST` / `OLLAMA_MODEL` en `.env`.
- `Ctrl+C` / `Ctrl+D` cierran la sesión limpiamente, incluso si el agente está
  en medio de una corrida (termina el turno en curso y sale).