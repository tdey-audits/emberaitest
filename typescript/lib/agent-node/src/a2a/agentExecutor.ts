import { type AgentExecutor, type ExecutionEventBus, RequestContext } from '@a2a-js/sdk/server';

import type { AIService } from '../ai/service.js';
import type { SessionManager } from './sessions/manager.js';
import type { WorkflowRuntime } from '../workflows/runtime.js';
import type { RiskManager } from '../risk/index.js';

import { AIHandler } from './handlers/aiHandler.js';
import { MessageHandler } from './handlers/messageHandler.js';
import { WorkflowHandler } from './handlers/workflowHandler.js';

/**
 * Creates an AgentExecutor that integrates with the workflow runtime and AI
 */
export function createAgentExecutor(
  workflowRuntime: WorkflowRuntime | undefined,
  ai: AIService,
  sessionManager: SessionManager,
  riskManager?: RiskManager,
): AgentExecutor {
  return new A2AAgentExecutor(workflowRuntime, ai, sessionManager, riskManager);
}

/**
 * Main agent executor implementation for the A2A system
 * Delegates to specialized handlers for different aspects of agent functionality
 */
class A2AAgentExecutor implements AgentExecutor {
  private messageHandler: MessageHandler;
  private workflowHandler: WorkflowHandler;
  private aiHandler: AIHandler;

  constructor(
    workflowRuntime: WorkflowRuntime | undefined,
    ai: AIService,
    sessionManager: SessionManager,
    riskManager?: RiskManager,
  ) {
    // Initialize handlers
    this.workflowHandler = new WorkflowHandler(workflowRuntime, riskManager);
    this.aiHandler = new AIHandler(ai, this.workflowHandler, sessionManager, riskManager);
    this.messageHandler = new MessageHandler(this.workflowHandler, this.aiHandler);
  }

  async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const { userMessage, taskId, contextId } = requestContext;

    // Extract message content and data
    const { content: messageContent, data: messageData } =
      this.messageHandler.extractMessageParts(userMessage);

    // Delegate to message handler for routing and processing
    await this.messageHandler.handleMessage(
      taskId,
      contextId,
      messageContent,
      messageData,
      eventBus,
    );
  }

  async cancelTask(taskId: string, _eventBus: ExecutionEventBus): Promise<void> {
    // Delegate cancellation to workflow handler
    this.workflowHandler.cancelTask(taskId);
    return Promise.resolve();
  }
}
