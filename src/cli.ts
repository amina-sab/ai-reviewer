import { readFile } from "node:fs/promises";
import path from "node:path";
import { AnthropicLlmClient } from "./agent/llmClient.ts";
import { reviewDiff } from "./agent/review.ts";

const diffPath = process.argv[2];
const repoRoot = path.resolve(process.argv[3] ?? ".");

if (!diffPath) {
  console.error("Usage : npm run review -- tests/diffs/signature-change.diff C:\\chemin\\vers\\ton-repo");
  process.exit(2);
}

try {
  const diff = await readFile(diffPath, "utf8");
  const outcome = await reviewDiff(diff, new AnthropicLlmClient("claude-haiku-5-5"), {
    repoRoot,
    maxTurns: 10,
    log: console.log,
  });

  if (!outcome.ok) {
    console.error(`Échec : ${outcome.error}`);
    process.exitCode = 2;
  } else {
    console.log(`Verdict : ${outcome.verdict.verdict}`);
    console.log(`Raison  : ${outcome.verdict.reason}`);
    process.exitCode = outcome.verdict.verdict === "APPROVE" ? 0 : 1;
  }
} catch (error) {
  // Clé absente, réseau coupé, fichier diff introuvable… : jamais un APPROVE
  console.error(`Erreur technique : ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}