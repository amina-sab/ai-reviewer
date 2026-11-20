export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
};

export const submitVerdictTool: ToolDefinition = {
  name: "submit_verdict",
  description:
    "Rend le verdict final de la revue de la pull request. " +
    "À appeler une seule fois, quand ta décision est prise.",
  inputSchema: {
    type: "object",
    properties: {
      verdict: {
        type: "string",
        enum: ["APPROVE", "REQUEST_CHANGES"],
        description: "APPROVE si le changement est bon, REQUEST_CHANGES sinon.",
      },
      reason: {
        type: "string",
        description: "Une ou deux phrases. Pour REQUEST_CHANGES, cite le fichier concerné.",
      },
    },
    required: ["verdict", "reason"],
  },
};