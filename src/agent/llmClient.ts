import Anthropic from "@anthropic-ai/sdk";
import type { ToolDefinition } from "../tools/submitVerdict.ts";

export type ToolCall = { id: string; name: string; input: unknown };
export type ToolResult = { toolCallId: string; content: string; isError: boolean };

// Les trois sortes de messages de l'historique
export type LlmMessage =
  | { role: "user"; text: string }                                     // ta consigne + le diff
  | { role: "assistant"; text: string; toolCalls: ToolCall[] }         // ce que le modèle a répondu
  | { role: "tool_results"; results: ToolResult[] };                  // tes réponses à ses demandes d'outils

export type ToolChoice = { type: "any" } | { type: "tool"; name: string };

export type LlmRequest = {
  system?: string;
  messages: LlmMessage[];
  maxTokens: number;
  tools?: ToolDefinition[];
  toolChoice?: ToolChoice;
};

export type LlmReply = {
  stopReason: string | null;
  text: string;
  toolCalls: ToolCall[];
  inputTokens: number;
  outputTokens: number;
};

export interface LlmClient {
  send(request: LlmRequest): Promise<LlmReply>;
}

// Traduit TES messages dans le format de l'API Anthropic
function toSdkMessage(m: LlmMessage): Anthropic.MessageParam {
  switch (m.role) {
    case "user":
      return { role: "user", content: m.text };
    case "assistant":
      return {
        role: "assistant",
        content: [
          ...(m.text ? [{ type: "text" as const, text: m.text }] : []),
          ...m.toolCalls.map(c => ({ type: "tool_use" as const, id: c.id, name: c.name, input: c.input })),
        ],
      };
    case "tool_results":
      return {
        role: "user",
        content: m.results.map(r => ({
          type: "tool_result" as const,
          tool_use_id: r.toolCallId,
          content: r.content,
          is_error: r.isError,
        })),
      };
  }
}

export class AnthropicLlmClient implements LlmClient {
  private readonly client = new Anthropic();
  private readonly model: string;

  constructor(model: string) {
    this.model = model;
  }

  async send(request: LlmRequest): Promise<LlmReply> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: request.maxTokens,
      messages: request.messages.map(toSdkMessage),
      ...(request.system ? { system: request.system } : {}),
      ...(request.tools
        ? { tools: request.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema })) }
        : {}),
      ...(request.toolChoice ? { tool_choice: request.toolChoice } : {}),
    });

    const texts: string[] = [];
    const toolCalls: ToolCall[] = [];
    for (const block of message.content) {
      if (block.type === "text") texts.push(block.text);
      else if (block.type === "tool_use") toolCalls.push({ id: block.id, name: block.name, input: block.input });
    }

    return {
      stopReason: message.stop_reason,
      text: texts.join("\n"),
      toolCalls,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };
  }
}