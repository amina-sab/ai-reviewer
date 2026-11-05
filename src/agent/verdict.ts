export type VerdictValue = "APPROVE" | "REQUEST_CHANGES";
export type Verdict = { verdict: VerdictValue; reason: string };

// Soit un verdict valide, soit une erreur expliquée
export type VerdictResult =
  | { ok: true; value: Verdict }
  | { ok: false; error: string };

export function validateVerdict(input: unknown): VerdictResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "verdict must be an object" };
  }

  const { verdict, reason } = input as Record<string, unknown>;

  if (verdict !== "APPROVE" && verdict !== "REQUEST_CHANGES") {
    return { ok: false, error: `invalid verdict value: ${String(verdict)}` };
  }
  if (typeof reason !== "string" || reason.trim() === "") {
    return { ok: false, error: "reason is missing or empty" };
  }

  return { ok: true, value: { verdict, reason: reason.trim() } };
}