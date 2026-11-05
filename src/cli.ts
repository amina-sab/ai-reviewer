import { AnthropicLlmClient } from "./agent/llmClient.ts";
import { readFile } from "node:fs/promises";
import { submitVerdictTool } from "./tools/submitVerdict.ts";
import { validateVerdict } from "./agent/verdict.ts";


const diffPath = process.argv[2];

if (!diffPath) {
  console.error("Usage : npm run review -- <chemin/vers/un.diff>");
  process.exit(1);
}

const diff = await readFile(diffPath, "utf8");

const prompt = `Tu relis une pull request. Voici son diff, entre les balises <diff>.
Dis si ce changement introduit un problème, lequel, et dans quel fichier.

<diff>
${diff}
</diff>`;

const llm = new AnthropicLlmClient("claude-haiku-5-5");

const reply = await llm.send({
  prompt,
  maxTokens: 1024,
  tools: [submitVerdictTool],
  toolChoice: "submit_verdict",
});

const call = reply.toolCalls.find(c => c.name === "submit_verdict");

if (!call) {
  console.error("Le modèle n'a pas rendu de verdict.");
  process.exitCode = 2;
} else {
  const result = validateVerdict(call.input);

  if (!result.ok) {
    console.error(`Verdict rejeté : ${result.error}`);
    process.exitCode = 2;
  } else {
    console.log(`Verdict : ${result.value.verdict}`);
    console.log(`Raison  : ${result.value.reason}`);
    process.exitCode = result.value.verdict === "APPROVE" ? 0 : 1;
  }
}

console.log(`— usage : ${reply.inputTokens} tokens en entrée, ${reply.outputTokens} en sortie`);

