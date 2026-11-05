import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";

// 1. Récupérer le chemin du diff passé en argument
const diffPath = process.argv[2];

if (!diffPath) {
  console.error("Usage : npm run review -- <chemin/vers/un.diff>");
  process.exit(1);
}

// 2. Lire le fichier
const diff = await readFile(diffPath, "utf8");

// 3. Construire le message : consigne + diff entre balises
const prompt = `Tu relis une pull request. Voici son diff, entre les balises <diff>.
Dis si ce changement introduit un problème, lequel, et dans quel fichier.

<diff>
${diff}
</diff>`;

// 4. Envoyer au modèle
const client = new Anthropic(); // lit ANTHROPIC_API_KEY dans l'environnement

const message = await client.messages.create({
  model: "claude-haiku-5-5",
  max_tokens: 1024,
  messages: [{ role: "user", content: prompt }],
});

// 5. Afficher seulement le texte de la réponse, puis la consommation
for (const block of message.content) {
  if (block.type === "text") {
    console.log(block.text);
  }
}

console.log(message.usage);