# FASE 4 — Que el agente MEMORICE (persistencia con SQLite)

> Explicado con peras y manzanas, para un junior.
> F1 habla, F2 lee, F3 juzga. Ahora: lo que juzgó **no se le olvida**.

---

## 1. La gran idea

Hasta ahora todo pasaba **en la cabeza** del agente: buscó, leyó, calificó...
y cuando terminó, chau. Le preguntás mañana y no se acuerda de nada.

Para eso existe el **estado persistente**: un lugar donde el agente ESCRIBE
sus resultados y que **sobrevive** a cada ejecución.

Es la diferencia entre resolver la cuenta en una servilleta de papel
(que tiras) y anotarla en un cuaderno (que guardás):

```
  SIN persistence                          CON persistence
  +-------------------------+              +-----------------------------+
  | RUN 1: Busco, califico  |              | RUN 1: Busco, califico      |
  |   -> "Buenos Aires IT"  |              |   -> save_lead              |
  |   -> se me olvida       |              |        |                    |
  +-------------------------+              |        v                    |
                                           |   +- CUADERNO (SQLite) -+  |
                                           |   | Buenos Aires IT      |  |
                                           |   | 59/100 quizás        |  |
                                           |   | 2026-09-11 12:30     |  |
                                           |   +----------------+-----+  |
                                           |                            |
                                           | RUN 2: "¿qué guardé ayer?" |
                                           |   -> listLeads()           |
                                           |   -> ¡se acuerda!          |
                                           +-----------------------------+
```

**La herramienta:** SQLite (un archivo `.db`). Sin servidor, sin instalación
extra, perfecto para empezar. En este proyecto usamos `node:sqlite`, que viene
de fábrica en Node.

---

## 2. Mapa del territorio

```
src/
  persistence/
    store.ts        <- LeadStore: la "biblioteca" que habla con SQLite
  tools/
    saveLead.ts     <- el tool save_lead (el agente escribe en la biblioteca)
  smoke/
    persist.ts      <- la prueba (desde cero: guarda, corre el agente, relee)
package.json        <- nuevo script: npm run persist:test
.gitignore          <- data/ (los .db no se commitean)
```

---

## 3. Las piezas

### Pieza 1 — `store.ts` : la biblioteca (LeadStore)

Un `LeadStore` es la interfaz hacia la base. No sabés cómo guarda por dentro,
le decís "guardá esto" / "traé esto".

**Los estantes (tablas SQL):**

```
  TABLA: leads                      TABLA: runs
  +----+-----------------+-------+   +----+---------------------+-------+
  | id | name            | score |   | id | goal                | turns |
  |----+-----------------+-------|   |----+---------------------+-------|
  | 1  | Soporte Digital | 59    |   | 1  | Buscá UNA agencia   | 5     |
  | 2  | Zapatería Pepe  | 0     |   +----+---------------------+-------+
  | 3  | Buenos Aires IT | 76    |
  +----+-----------------+-------+

  leads  = lo que encontraste calificado   (el tesoro)
  runs   = cada ejecución del agente       (el historial)
```

**Los métodos (los trámites de la biblioteca):**

| Método | Qué hace |
|--------|----------|
| `saveLead(...)` | Guarda un lead. Si ya existe name+url, NO duplica. |
| `listLeads()` | Trae lo guardado, los más nuevos primero. |
| `countLeads()` | ¿Cuántos leads hay? (el "contador de tesoros") |
| `saveRun(...)` | Anota una ejecución del agente (goal, respuesta, turnos). |
| `listRuns()` | Historial de ejecuciones. |
| `close()` | Cierra la base (a lavarse las manos). |

**Detalle fino — `INSERT OR IGNORE`:** la base tiene una restricción única
en `(name, url)`. Si el agente re-califica al mismo candidato, no crea una
fila nueva: devuelve `inserted: false`. Así no tenés 50 copias de "Buenos
Aires IT" acumuladas.

### Pieza 2 — `tools/saveLead.ts` : el escriba

```
  name:      save_lead
  input:     { name, url, score, result, location?, reasons? }
  output:    { saved: { id, inserted, message } }
```

**En criollo:** el tool es el "escriba" que usa el agente para anotar en el
cuaderno apenas califica. Si está activo, el agente guarda al toque (así lo
instructora su system prompt) y después responde.

### Pieza 3 — `smoke/persist.ts` : la demostración

Prueba reproducible: borra la base, siembra 2 leads directos (via el motor
de qualification de la F3), re-savea uno para ver que no duplica, corre el
agente completo (busca -> fetch -> qualify -> save_lead) y finalmente LEE
la base para mostrar que todo quedó.

```
  (1) Guardado directo
      Soporte Digital Labs -> id=1 inserted=true
      Zapatería Don Pepe   -> id=2 inserted=true
      re-save de #1        -> id=1 inserted=false   <- no duplica
  (2) Agente: busca -> fetch -> qualify -> save_lead (id=4)
  (3) Relee: leads en db: 3  + última ejecución (runs)
```

---

## 4. Un paseo por una llamada real

**El agente decidió (turno 4):**

```json
{
  "kind": "tool",
  "tool": "save_lead",
  "args": {
    "name": "Buenos Aires IT",
    "url": "https://buenosairesit.com/",
    "score": 59,
    "result": "quizás",
    "reasons": ["Coincide la ubicación buscada: buenos aires.", "Servicios que coinciden: ..."]
  }
}
```

**El escriba respondió:**

```json
{ "saved": { "id": 4, "inserted": true, "message": "Lead guardado con id 4" } }
```

**Después, al consultar (listLeads), sigue ahí:**

```
[4] QUIZÁS 59/100 - Buenos Aires IT (https://buenosairesit.com/)
[2] NO   0/100  - Zapatería Don Pepe (https://zapateria-pepe.fake)
[1] QUIZÁS 59/100 - Soporte Digital Labs (https://soportedigital.fake)
```

**En criollo:** el agente ya "no se acuerda de nada", PERO tiene un cuaderno
que sí se acuerda. Y el cuaderno es lo que vale.

---

## 5. Las decisiones que importan (y por qué)

| Decisión | Por qué |
|----------|---------|
| **SQLite** (un archivo) | Sin servidor ni setup. El archivo `data/leads.db` ES la base. |
| `node:sqlite` (módulo nativo) | Cero dependencias nuevas (mejor para un stack minimalista). |
| Tablas separadas `leads` y `runs` | No mezclás "lo que encontré" con "lo que hice". |
| Unicidad `(name, url)` + `INSERT OR IGNORE` | Evita leads duplicados por re-calificación. |
| `reasons`/`matched` como **JSON en texto** | Guardás arrays completos sin esquema complicado. |
| WAL (journal mode) | Lectura/escritura concurrente más fluida en SQLite. |
| `.gitignore` de `data/` | Los datos locales NO van al repo (cada uno corre sus pruebas). |

---

## 6. Cómo lo pruebo

```bash
npm run persist:test
```

Si lo corrés 2 veces, la segunda arranca borrando la base: reproducibilidad
total (sabés que el resultado no es "basura acumulada" de antes).

---

## 7. Checklist "¿lo entendí?"

- [ ] Puedo explicar la diferencia entre "estado en memoria" y "estado persistente".
- [ ] Sé qué tablas crea `LeadStore` y qué guarda cada una.
- [ ] Sé qué pasa si guardo 2 veces el mismo name+url.
- [ ] Sé por qué `data/` está en `.gitignore`.
- [ ] Corrí `npm run persist:test` y vi leads + run guardados.

---

**Siguiente fase:** Memory — que el agente no solo guarde, sino que **use** lo
guardado en el futuro (memoria episódica/contexto previo).