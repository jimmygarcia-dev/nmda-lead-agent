import 'dotenv/config';
import { AgentMemory } from '../memory/memory.js';
import { LeadStore } from '../persistence/store.js';
import { buildHostRegistry } from '../tools/host.js';
import { McpToolServer } from './server.js';

const dbPath = process.env.LEAD_DB ?? 'data/leads.db';
const store = new LeadStore(dbPath);
const memory = new AgentMemory(store);
const registry = buildHostRegistry(store, memory);

const server = new McpToolServer(registry, { name: 'nmda-lead-tools', version: '0.1.0' });
await server.start();