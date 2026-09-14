import type { ToolDefinition } from '../llm/types.js';
import type { Tool } from '../core/types.js';

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): this {
    this.tools.set(tool.name, tool);
    return this;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Nombre registrado más parecido al pedido. El modelo suele mandar "searchgoogle"
   * o "search google" en vez de "search_google"; normalizamos ignorando _, -, espacios
   * y mayúsculas. Devuelve el mismo nombre si no hay match (execute() fallará claro).
   */
  resolve(name: string): string {
    if (this.tools.has(name)) return name;
    const norm = (s: string) => s.toLowerCase().replace(/[_\-\s]/g, '');
    const wanted = norm(name);
    for (const key of this.tools.keys()) {
      if (norm(key) === wanted) return key;
    }
    return name;
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool no registrado: ${name}`);
    }
    return await tool.execute(args);
  }
}