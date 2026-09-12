import readline from 'node:readline';
import type { ToolRegistry } from '../tools/registry.js';
import {
  MCP_PROTOCOL_VERSION,
  McpError,
  isNotification,
  type McpToolCallResult,
  type RpcMessage,
  type RpcNotification,
  type RpcResponse,
} from './protocol.js';

interface ServerInfo {
  name: string;
  version: string;
}

/**
 * Servidor MCP mínimo sobre stdio (NDJSON/JSON-RPC 2.0).
 * Expone los tools de un ToolRegistry local a CUALQUIER cliente MCP.
 */
export class McpToolServer {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly serverInfo: ServerInfo = { name: 'nmda-tools', version: '0.1.0' },
  ) {}

  async start(): Promise<void> {
    const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      const reply = await this.handleLine(line);
      if (reply) process.stdout.write(reply + '\n');
    }
  }

  async handleLine(line: string): Promise<string | null> {
    let msg: RpcMessage;
    try {
      msg = JSON.parse(line) as RpcMessage;
    } catch {
      return this.error(-32700, 'Parse error', null);
    }

    if (isNotification(msg)) {
      await this.consumeNotification(msg);
      return null;
    }

    const id = msg.id;
    const method = msg.method;
    const params = msg.params ?? {};
    try {
      return JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: await this.dispatch(method, params),
      } satisfies RpcResponse);
    } catch (err) {
      const rpcErr = err instanceof McpError ? err : new McpError(-32603, messageOf(err));
      return this.error(rpcErr.code, rpcErr.message, id);
    }
  }

  private async consumeNotification(_msg: RpcNotification): Promise<void> {
    // Por ahora no hacemos nada con notificaciones de estado.
  }

  private async dispatch(method: string, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case 'initialize':
        return {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: this.serverInfo,
        };

      case 'ping':
        return {};

      case 'tools/list':
        return {
          tools: this.registry.list().map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.parameters,
          })),
        };

      case 'tools/call': {
        const name = typeof params.name === 'string' ? params.name : '';
        const args = this.asObject(params.arguments);
        if (!name) throw new McpError(-32602, 'Falta el nombre del tool.');
        const result = await this.registry.execute(name, args);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          isError: false,
        } satisfies McpToolCallResult;
      }

      case 'resources/list':
        return { resources: [] };

      default:
        throw new McpError(-32601, `Método no soportado: ${method}`);
    }
  }

  private asObject(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private error(code: number, message: string, id: number | string | null): string {
    return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } } satisfies RpcResponse);
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}