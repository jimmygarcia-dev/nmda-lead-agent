export const MCP_PROTOCOL_VERSION = '2024-11-05';

export interface RpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface RpcNotification {
  jsonrpc: '2.0';
  id?: never;
  method: string;
  params?: Record<string, unknown>;
}

export type RpcMessage = RpcRequest | RpcNotification;

export interface RpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface RpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: RpcError;
}

export function isNotification(msg: RpcMessage): msg is RpcNotification {
  return !('id' in msg);
}

export interface McpToolSchema {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolCallResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

export class McpError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}