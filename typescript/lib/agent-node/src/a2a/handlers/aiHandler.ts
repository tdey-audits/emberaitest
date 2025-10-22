/**
 * AI handling for A2A Agent Executor
 */

import type { Task, TaskStatusUpdateEvent } from '@a2a-js/sdk';
import type { ExecutionEventBus } from '@a2a-js/sdk/server';
import type { Tool, TextStreamPart } from 'ai';

import type { AIService } from '../../ai/service.js';
import type { SessionManager } from '../sessions/manager.js';
import type { RiskManager } from '../../risk/index.js';
import { Logger } from '../../utils/logger.js';

import { StreamProcessor } from './streaming/StreamProcessor.js';
import { ToolHandler } from './toolHandler.js';
import { WorkflowHandler } from './workflowHandler.js';

/**
 * Handles AI-related operations for the agent executor
 */
export class AIHandler {
  private toolHandler: ToolHandler;
  private logger: Logger;
  private streamProcessor: StreamProcessor;

  constructor(
    private ai: AIService,
    private workflowHandler: WorkflowHandler,
    private sessionManager: SessionManager,
    private riskManager?: RiskManager,
  ) {
    this.toolHandler = new ToolHandler(ai, riskManager);
    this.logger = Logger.getInstance('AIHandler');
    this.streamProcessor = new StreamProcessor();
  }

  /**
   * Handles streaming AI processing
   */
  handleStreamingAIProcessing(
    messageContent: string,
    contextId: string,
    taskId: string,
    eventBus: ExecutionEventBus,
    messageData?: unknown,
  ): void {
    this.logger.debug('handleStreamingAIProcessing: start', {
      contextId,
      taskId,
      hasData: messageData !== undefined,
      contentLen: messageContent?.length ?? 0,
    });

    // Check if AI service supports streaming
    if (!this.ai.streamMessage) {
      throw new Error('AI service does not support streaming');
    }

    try {
      // Fetch conversation history if session exists (avoid throwing on unknown contextId)
      const existingSession = this.sessionManager.getSession(contextId);
      const history = existingSession ? this.sessionManager.getHistory(contextId) : [];

      this.logger.debug('Retrieved conversation history', {
        contextId,
        historyLength: history.length,
      });

      // Get available tools
      const bundle = this.toolHandler.createToolsBundle();
      const availableTools = bundle?.tools ?? this.toolHandler.getAvailableToolsAsMap();
      const toolsForSDK = availableTools;
      this.logger.debug('Streaming tools available', { tools: Object.keys(toolsForSDK) });

      // Create task and start streaming
      const task: Task = {
        kind: 'task',
        id: taskId,
        contextId,
        status: {
          state: 'submitted',
          timestamp: new Date().toISOString(),
        },
      };
      eventBus.publish(task);

      const workingUpdate: TaskStatusUpdateEvent = {
        kind: 'status-update',
        taskId,
        contextId,
        status: {
          state: 'working',
          timestamp: new Date().toISOString(),
        },
        final: false,
      };
      eventBus.publish(workingUpdate);

      // Stream the full response with tools - Vercel AI SDK handles tool calls internally
      this.logger.debug('About to create AI stream', {
        contextId,
        historyLength: history.length,
      });
      const stream = this.ai.streamMessage(
        { message: messageContent, contextId, history },
        { tools: toolsForSDK },
      );
      this.logger.debug('AI stream created successfully');

      // Start processing the stream using the StreamProcessor
      const streamPromise = this.streamProcessor.processStream(
        stream as AsyncIterable<TextStreamPart<Record<string, Tool>>>,
        {
          taskId,
          contextId,
          eventBus,
          onWorkflowDispatch: async (name, args, ctxId, bus) =>
            this.workflowHandler.dispatchWorkflow(name, args, ctxId, bus),
        },
      );

      // Store the user and assistant messages after streaming completes (if session exists)
      streamPromise
        .then((assistantMessage) => {
          if (this.sessionManager.getSession(contextId)) {
            // Add the user message for this turn
            this.sessionManager.addToHistory(contextId, {
              role: 'user',
              content: messageContent,
            });

            // Add assistant response if available
            if (assistantMessage) {
              this.sessionManager.addToHistory(contextId, assistantMessage);
              this.logger.debug('Stored assistant message in session history', {
                contextId,
                hasReasoning: assistantMessage.content.length > 1,
              });
            }
          }
        })
        .catch((error) => {
          this.logger.error('Stream processing error', error);
          const errorUpdate: TaskStatusUpdateEvent = {
            kind: 'status-update',
            taskId,
            contextId,
            status: {
              state: 'failed',
              timestamp: new Date().toISOString(),
            },
            final: true,
          };
          eventBus.publish(errorUpdate);
        });

      // Return immediately so the generator can start yielding events
      this.logger.debug('handleStreamingAIProcessing: returning control to generator');
    } catch (error) {
      this.logger.error('handleStreamingAIProcessing error', error);
      throw error;
    }
  }
}
