import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { ToolParameterSchema } from '../llm/types.js';
import { ToolRegistry } from '../tools/registry.js';
import type { McpToolCallResult, McpToolSchema } from './protocol.js';

function resolveTsxCli(): string {
  return fileURLToPath(new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url));
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

/**
 * Cliente MCP mínimo sobre stdio: habla JSON-RPC 2.0 NDJSON con un servidor MCP
 * (ej. un proceso aparte). Permite usar tools REMOTOS como si fueran locales.
 */
export class McpClient {
  readonly child: ChildProcess;
  private nextId = 1;
  private pending = new Map<number | string, Pending>();
  private buffer = '';
  private errorListener: ((err: Error) => void) | undefined;

  constructor(scriptPath: string, env: NodeJS.ProcessEnv = process.env) {
    this.child = spawn(process.execPath, [resolveTsxCli(), scriptPath], {
      stdio: ['pipe', 'pipe', 'inherit'],
      env,
    });

    this.child.stdout!.setEncoding('utf8');
    this.child.stdout!.on('data', (chunk: string) => this.onData(chunk));
    this.child.on('error', (err) => this.rejectAll(err));
    this.child.on('exit', (code) => {
      this.rejectAll(new Error(`El servidor MCP terminó (exit ${code}).`));
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) this.onLine(line);
    }
  }

  private onLine(line: string): void {
    let msg: { id?: number | string | null; result?: unknown; error?: { message?: string } };
    try {
      msg = JSON.parse(line) as typeof msg;
    } catch {
      return;
    }
    const id = msg.id;
    if (id === undefined || id === null) return;
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    if (msg.error) {
      p.reject(new Error(msg.error.message ?? 'Error MCP'));
    } else {
      p.resolve(msg.result);
    }
  }

  private onConnectionError(err: Error): void {
    this.errorListener?.(err);
  }

  private rejectAll(err: Error): void {
    for (const [, p] of this.pending) p.reject(err);
    this.pending.clear();
    this.onConnectionError(err);
  }

  private request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.nextId++;
    const payload = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin!.write(JSON.stringify(payload) + '\n', (err) => {
        if (err) {
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  initialize(): Promise<{ protocolVersion: string; capabilities: unknown; serverInfo: unknown }> {
    return this.request('initialize') as Promise<{
      protocolVersion: string;
      capabilities: unknown;
      serverInfo: unknown;
    }>;
  }

  async listTools(): Promise<McpToolSchema[]> {
    const res = (await this.request('tools/list')) as { tools?: McpToolSchema[] };
    return res.tools ?? [];
  }

  callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    return this.request('tools/call', { name, arguments: args }) as Promise<McpToolCallResult>;
  }

  ping(): Promise<unknown> {
    return this.request('ping');
  }

  close(): void {
    try {
      this.child.kill();
    } catch {
      // ya terminó
    }
  }
}

/** Convierte los tools remotos de un servidor MCP en un ToolRegistry local. */
export async function createRegistryFromMcp(client: McpClient): Promise<ToolRegistry> {
  const remoteTools = await client.listTools();
  const registry = new ToolRegistry();

  for (const def of remoteTools) {
    registry.register({
      name: def.name,
      description: def.description ?? '',
      parameters: (def.inputSchema ?? { type: 'object', properties: {} }) as ToolParameterSchema,
      async execute(args) {
        const res = await client.callTool(def.name, args);
        if (res.isError) {
          return { error: 'El tool remoto devolvió un error.' };
        }
        const text = res.content?.[0]?.text ?? '';
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return { text };
        }
      },
    });
  }

  return registry;
}