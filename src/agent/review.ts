import type { LlmClient, LlmMessage, ToolResult } from "./llmClient.ts";
import { submitVerdictTool } from "../tools/submitVerdict.ts";
import { readFileTool, executeReadFile } from "../tools/readFile.ts";
import { validateVerdict, type Verdict } from "./verdict.ts";
import{SYSTEM_PROMPT} from "../prompts/system.ts";

export type ReviewOutcome =
  | { ok: true; verdict: Verdict }
  | { ok: false; error: string };

export type ReviewOptions = {
  repoRoot: string;               // le dossier du dépôt relu, pour read_file
  maxTurns: number;               // le plafond de tours
  log?: (line: string) => void;   // où écrire les traces (console.log dans cli.ts)
};
function buildPrompt(diff: string): string {
  return `<diff>\n${diff}\n</diff>`;
}

export async function reviewDiff(diff: string, llm: LlmClient, options: ReviewOptions): Promise<ReviewOutcome> {
  const log = options.log ?? (() => {});

  // L'historique : il grossit à chaque tour et il est renvoyé en entier
  const messages: LlmMessage[] = [{ role: "user", text: buildPrompt(diff) }];

  for (let turn = 1; turn <= options.maxTurns; turn++) {
    // A. Appeler le modèle. Au dernier tour, on ne lui laisse qu'un seul choix : conclure.
    const isLastTurn = turn === options.maxTurns;
    const reply = await llm.send({
      messages,
      maxTokens: 1024,
      tools: isLastTurn ? [submitVerdictTool] : [readFileTool, submitVerdictTool],
      toolChoice: isLastTurn
        ? { type: "tool", name: "submit_verdict" }
        : { type: "any" },
    });
    // B. Garder sa réponse dans l'historique
    messages.push({ role: "assistant", text: reply.text, toolCalls: reply.toolCalls });
    log(`[tour ${turn}] stop=${reply.stopReason} outils=${reply.toolCalls.map(c => c.name).join(",") || "aucun"} tokens_in=${reply.inputTokens}`);

    // C. Aucun outil demandé : anormal, on s'arrête en échec
    if (reply.toolCalls.length === 0) {
      return { ok: false, error: `Arrêt inattendu (${reply.stopReason}) sans verdict` };
    }

    // D. Le modèle rend son verdict : on valide et on sort de la boucle
    const verdictCall = reply.toolCalls.find(c => c.name === "submit_verdict");
    if (verdictCall) {
      const result = validateVerdict(verdictCall.input);
      return result.ok ? { ok: true, verdict: result.value } : { ok: false, error: result.error };
    }

    // E. Sinon, exécuter chaque outil demandé et renvoyer les résultats
    const results: ToolResult[] = [];
    for (const call of reply.toolCalls) {
      if (call.name === "read_file") {
        const output = await executeReadFile(call.input, options.repoRoot);
        log(`  read_file ${JSON.stringify(call.input)} → ${output.isError ? "erreur : " + output.content : "ok"}`);
        results.push({ toolCallId: call.id, content: output.content, isError: output.isError });
      } else {
        results.push({ toolCallId: call.id, content: `Outil inconnu : ${call.name}`, isError: true });
      }
    }
    messages.push({ role: "tool_results", results });
  }

  // F. Plus de tours disponibles : échec explicite
  return { ok: false, error: `Plafond de ${options.maxTurns} tours atteint sans verdict` };
}