# CLI interactivo — `npm run chat`

Modo interactivo donde el agente **espera un objetivo por consola**, lo ejecuta
con el stack completo y queda esperando el siguiente. La base persiste entre
sesiones en `data/cli.db`.

## Uso

```bash
npm run chat
```

```
── NMDA Lead Agent — modo interactivo ──
modelo: qwen2.5:7b
tools:  search_google, fetch_page, qualify_lead, save_lead, recall_memory
base:   data/cli.db (0 lead(s))

╭ objetivo
╰ <escribí tu objetivo y Enter>
```

El agente imprime cada paso (tool + resultado), después la respuesta final.
Al terminar queda a la espera del próximo objetivo, con la memoria (y los
leads guardados) de la misma sesión.

## Multi-turno (sesión)

Dentro de la misma sesión del CLI, cada objetivo **concluido** se resume y se
inyecta como contexto al siguiente pedido. Así podés encadenar:

```
╭ objetivo        →  buscá agencias de diseño web en Buenos Aires
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

```bash
NMDA_APPROVAL=1 NMDA_MAX_TURNS=6 npm run chat
```

## Notas

- Todo lo que el agente guarda como lead vive en la DB indicada por `NMDA_DB`;
  `search_google` usa el provider de `SEARCH_PROVIDER` (default DuckDuckGo) y
  el LLM es el de `OLLAMA_HOST` / `OLLAMA_MODEL` en `.env`.
- `Ctrl+C` / `Ctrl+D` cierran la sesión limpiamente, incluso si el agente está
  en medio de una corrida (termina el turno en curso y sale).