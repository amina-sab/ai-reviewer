import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // lit ANTHROPIC_API_KEY dans l'environnement

const message = await client.messages.create({
  model: "claude-haiku-5-5",
  max_tokens: 256,
  messages: [{ role: "user", content: "Dis bonjour en une phrase." }],
});

console.log(message.content);
console.log(message.usage);