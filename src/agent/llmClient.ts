import Anthropic from "@anthropic-ai/sdk";
import type{ToolDefinition} from "../tools/submitVerdict.ts";
export type ToolCall = {
  id: string;
  name: string;
  input: unknown; 
};

export type LlmRequest = {
  system?: string;
  prompt: string;
  maxTokens: number;
  tools?: ToolDefinition[];
  toolChoice?: string;
};

export type LlmResponse = {
  stopReason: string | null;
  text: string; 
  toolCalls: ToolCall[];  
  inputTokens: number;
  outputTokens: number;
};

interface LlmClient {send(request: LlmRequest): Promise<LlmResponse>;}



export class AnthropicLlmClient implements LlmClient {

  private readonly client = new Anthropic();
  private readonly model: string;

  constructor(model: string) {
    this.model = model;
  }

  async send(request: LlmRequest): Promise<LlmResponse> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: request.maxTokens,
      ...(request.tools
        ? { tools: 
            request.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema })) }
        : {}),
      ...(request.toolChoice 
        ? { tool_choice: 
            { type: "tool" as const, name: request.toolChoice } } : {}),...(request.system ? { system: request.system } : {}),
      messages: [{ role: "user", content: request.prompt }],
    });

    const texts: string[] = [];
    const toolCalls: ToolCall[] = [];

    for (const block of message.content) {
      if (block.type === "text") {
        texts.push(block.text);
      } else if (block.type === "tool_use") {
        toolCalls.push({ id: block.id, name: block.name, input: block.input });
      }
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