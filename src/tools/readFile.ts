import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { ToolDefinition } from "./submitVerdict.ts";

const MAX_CHARS = 20_000;

export const readFileTool: ToolDefinition = {
  name: "read_file",
  description:
    "Renvoie le contenu complet d'un fichier du dépôt relu, à partir d'un chemin " +
    "relatif à la racine du dépôt (par exemple src/Services/ReviewService.cs). " +
    "Utile pour voir le code qui appelle ou entoure une modification. " +
    "Échoue si le fichier n'existe pas ou sort du dépôt.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Chemin relatif à la racine du dépôt." },
    },
    required: ["path"],
  },
};

export type ToolOutput = { content: string; isError: boolean };

export async function executeReadFile(input: unknown, repoRoot: string): Promise<ToolOutput> {
  // 1. Le chemin vient du modèle : on vérifie sa forme
  const requested = (input as { path?: unknown } | null)?.path;
  if (typeof requested !== "string" || requested.trim() === "") {
    return { content: "Paramètre path absent ou vide.", isError: true };
  }
  if (path.isAbsolute(requested)) {
    return { content: "Chemin absolu refusé : donne un chemin relatif à la racine du dépôt.", isError: true };
  }

  try {
    // 2. On résout les vrais chemins (liens symboliques compris)
    const root = await realpath(repoRoot);
    const full = await realpath(path.resolve(root, requested));

    // 3. Le fichier doit rester DANS le dépôt
    const relative = path.relative(root, full);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return { content: "Chemin hors du dépôt refusé.", isError: true };
    }

    // 4. Ce doit être un fichier, et on borne sa taille
    if (!(await stat(full)).isFile()) {
      return { content: `${requested} n'est pas un fichier.`, isError: true };
    }
    const text = await readFile(full, "utf8");
    return text.length > MAX_CHARS
      ? { content: text.slice(0, MAX_CHARS) + "\n[… fichier tronqué …]", isError: false }
      : { content: text, isError: false };
  } catch {
    return { content: `Fichier introuvable : ${requested}`, isError: true };
  }
}