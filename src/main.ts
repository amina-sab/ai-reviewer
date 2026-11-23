import { readFile } from "node:fs/promises";
import * as core from "@actions/core";
import { reviewDiff } from "./agent/review.ts";
import { AnthropicLlmClient } from "./agent/llmClient.ts";

async function run(): Promise<void> {
  const apiKey = core.getInput("anthropic-api-key", { required: true });
  const model = core.getInput("model") || "claude-haiku-5-5";
  const maxTurns = Number(core.getInput("max-turns") || "10");
  const diffPath = core.getInput("diff-path", { required: true }); 

  core.setSecret(apiKey);
  process.env.ANTHROPIC_API_KEY = apiKey; 

  const repoRoot = process.env.GITHUB_WORKSPACE ?? process.cwd();

  const diff = await readFile(diffPath, "utf8");
  const outcome = await reviewDiff(diff, new AnthropicLlmClient(model), {
    repoRoot,
    maxTurns,
    log: line => core.info(line),
  });

  if (!outcome.ok) {
    core.setFailed(`Revue impossible : ${outcome.error}`);
    return;
  }
  core.setOutput("verdict", outcome.verdict.verdict);
  core.setOutput("reason", outcome.verdict.reason);
  core.info(`Verdict : ${outcome.verdict.verdict}`);
  core.info(`Raison  : ${outcome.verdict.reason}`);

  if (outcome.verdict.verdict === "REQUEST_CHANGES") {
    core.setFailed(outcome.verdict.reason); // le check de la PR passe au rouge
  }
}

run().catch(error => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});