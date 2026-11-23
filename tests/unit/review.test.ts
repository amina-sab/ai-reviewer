// tests/unit/review.test.ts
import { describe, it, expect } from "vitest";
import { reviewDiff } from "../../src/agent/review.ts";
import type { LlmClient, LlmReply, LlmRequest, ToolCall } from "../../src/agent/llmClient.ts";

function reply(toolCalls: ToolCall[], stopReason = "tool_use"): LlmReply {
  return { stopReason, text: "", toolCalls, inputTokens: 0, outputTokens: 0 };
}

const verdict = (v: string, reason: string): ToolCall =>
  ({ id: "v1", name: "submit_verdict", input: { verdict: v, reason } });

const readPackageJson: ToolCall = { id: "r1", name: "read_file", input: { path: "package.json" } };

// Faux client : rejoue les réponses dans l'ordre (la dernière se répète), et garde les requêtes
function scriptedClient(replies: LlmReply[]): LlmClient & { requests: LlmRequest[] } {
  const requests: LlmRequest[] = [];
  return {
    requests,
    send: async request => {
      requests.push(structuredClone(request));
      const next = replies[Math.min(requests.length, replies.length) - 1];
      if (!next) throw new Error("Aucune réponse prévue");
      return next;
    },
  };
}

const options = { repoRoot: process.cwd(), maxTurns: 3 };

describe("reviewDiff", () => {
  it("accepte un verdict valide dès le premier tour", async () => {
    const client = scriptedClient([reply([verdict("APPROVE", "RAS")])]);
    expect(await reviewDiff("un diff", client, options))
      .toEqual({ ok: true, verdict: { verdict: "APPROVE", reason: "RAS" } });
  });

  it("refuse une valeur hors enum", async () => {
    const client = scriptedClient([reply([verdict("MAYBE", "bof")])]);
    expect((await reviewDiff("un diff", client, options)).ok).toBe(false);
  });

  it("échoue si le modèle n'appelle aucun outil", async () => {
    const client = scriptedClient([reply([], "end_turn")]);
    expect((await reviewDiff("un diff", client, options)).ok).toBe(false);
  });

  it("lit un fichier, puis conclut au tour suivant", async () => {
    const client = scriptedClient([
      reply([readPackageJson]),
      reply([verdict("REQUEST_CHANGES", "package.json : problème")]),
    ]);
    const outcome = await reviewDiff("un diff", client, options);

    expect(outcome.ok).toBe(true);
    expect(client.requests).toHaveLength(2);
    // Au 2e appel, l'historique contient : la consigne, la demande du modèle, le résultat
    expect(client.requests[1]?.messages).toHaveLength(3);
    expect(client.requests[1]?.messages[2]).toMatchObject({ role: "tool_results", results: [{ isError: false }] });
  });

   it("au dernier tour, n'offre que submit_verdict et l'impose", async () => {
    const client = scriptedClient([reply([readPackageJson])]); // demande un fichier à l'infini
    await reviewDiff("un diff", client, options);

    const first = client.requests[0];
    const last = client.requests.at(-1);

    // Tours normaux : les deux outils, choix libre
    expect(first?.toolChoice).toEqual({ type: "any" });
    expect(first?.tools?.map(t => t.name)).toEqual(["read_file", "submit_verdict"]);

    // Dernier tour : un seul outil, imposé
    expect(last?.toolChoice).toEqual({ type: "tool", name: "submit_verdict" });
    expect(last?.tools?.map(t => t.name)).toEqual(["submit_verdict"]);
  });
})