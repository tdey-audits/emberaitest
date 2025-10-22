/**
 * Tool handling for A2A Agent Executor
 */

import type { Tool } from 'ai';

import type { AIService } from '../../ai/service.js';
import type { RiskManager } from '../../risk/index.js';
import { Logger } from '../../utils/logger.js';

/**
 * Handles tool-related operations for the agent executor
 */
export class ToolHandler {
  private logger: Logger;

  constructor(private ai: AIService, private riskManager?: RiskManager) {
    this.logger = Logger.getInstance('ToolHandler');
  }

  /**
   * Gets available tools as a map for the AI SDK
   */
  getAvailableToolsAsMap(): Record<string, Tool> {
    const tools: Record<string, Tool> = {};

    // Get tools from AI service (already in tool format)
    if (this.ai?.availableTools instanceof Map) {
      this.ai.availableTools.forEach((tool: unknown, name: string) => {
        tools[name] = tool as Tool;
      });
    }
    this.logger.debug('getAvailableToolsAsMap', { tools: Object.keys(tools) });

    return tools;
  }

  /**
   * Executes a tool call through the AI service
   */
  async executeToolCall(toolName: string, args: unknown): Promise<unknown> {
    // Tools execute themselves via their embedded execute functions
    const tools = this.getAvailableToolsAsMap();
    const tool = tools[toolName];
    if (tool?.execute) {
      return await tool.execute(args, { toolCallId: toolName, messages: [] });
    }
    return null;
  }

  /**
   * Creates a tools bundle for the AI SDK
   */
  createToolsBundle():
    | {
        tools: Record<string, Tool>;
        onToolCall?: (name: string, args: unknown) => Promise<unknown>;
      }
    | undefined {
    // Get tools as a Record from AIService
    const toolsRecord = this.ai?.getToolsAsRecord?.();
    if (toolsRecord) {
      return {
        tools: toolsRecord,
        onToolCall: async (name: string, args: unknown) => {
          this.guardToolCall(name, args);
          return await this.executeToolCall(name, args);
        },
      };
    }

    // Fallback to available tools map
    const availableTools = this.getAvailableToolsAsMap();
    return {
      tools: availableTools,
      onToolCall: async (name: string, args: unknown) => {
        this.guardToolCall(name, args);
        return await this.executeToolCall(name, args);
      },
    };
  }

  private guardToolCall(name: string, args: unknown): void {
    if (!this.riskManager) {
      return;
    }
    const normalizedArgs = this.normalizeArgs(args);
    this.riskManager.evaluateToolInvocation(name, normalizedArgs);
  }

  private normalizeArgs(args: unknown): Record<string, unknown> | undefined {
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      return undefined;
    }
    return args as Record<string, unknown>;
  }
}
