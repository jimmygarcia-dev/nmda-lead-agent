import type { Agent } from '../core/agent.js';
import type { LLMProvider } from '../llm/LLMProvider.js';
import type { AgentMemory } from '../memory/memory.js';
import type { QualificationCriteria } from '../qualification/types.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { Job } from './jobStore.js';
import type { JobRunOutcome } from './scheduler.js';

export interface AgentJobRunnerOptions {
  provider: LLMProvider;
  registry: ToolRegistry;
  criteria: QualificationCriteria;
  memory: AgentMemory;
  maxTurns?: number;
  verbose?: boolean;
  buildAgent: (opts: {
    provider: LLMProvider;
    registry: ToolRegistry;
    criteria: QualificationCriteria;
    memory: AgentMemory;
    maxTurns: number;
    verbose: boolean;
  }) => Agent;
}

/** Runner que construye un agente nuevo por cada job (memoria siempre fresca). */
export function createAgentJobRunner(options: AgentJobRunnerOptions) {
  const maxTurns = options.maxTurns ?? 5;

  return async (job: Job): Promise<JobRunOutcome> => {
    const agent = options.buildAgent({
      provider: options.provider,
      registry: options.registry,
      criteria: options.criteria,
      memory: options.memory,
      maxTurns,
      verbose: options.verbose ?? false,
    });
    const result = await agent.run(job.goal);
    return { answer: result.answer, turns: result.turns };
  };
}