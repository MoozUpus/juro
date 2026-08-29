export type LegalEvidenceMode = "official" | "mixed" | "secondary_only" | "private_only" | "none";

export type LegalEvidenceSource = {
  originalUrl: string;
  status?: string;
  sourceClass?: string;
  sourceOrigin?: "indexed" | "live" | "web";
};

/** Client-safe compatibility derivation for responses saved before evidenceMode existed. */
export function deriveLegalEvidenceMode(input: {
  sources: readonly LegalEvidenceSource[];
  evidenceMode?: LegalEvidenceMode;
}): LegalEvidenceMode {
  if (input.evidenceMode) return input.evidenceMode;
  const classes = new Set(input.sources.flatMap((source) => {
    if (["OFFICIAL_LEGISLATION", "OFFICIAL_GOVERNMENT_GUIDANCE"].includes(source.sourceClass ?? "")) return ["official"];
    if (source.sourceClass === "SECONDARY_REFERENCE" || source.sourceOrigin === "web") return ["secondary"];
    if (["USER_TRUSTED_PRIVATE", "TENANT_TRUSTED_PRIVATE", "OWNER_TRUSTED_GLOBAL"].includes(source.sourceClass ?? "")) return ["private"];
    try {
      const url = new URL(source.originalUrl);
      if (url.protocol === "juro-private:") return ["private"];
      if (url.hostname === "lex.uz" || url.hostname === "www.lex.uz") return ["official"];
    } catch { /* Legacy rows can contain a non-URL locator. */ }
    return source.status === "unconfirmed" ? ["secondary"] : [];
  }));
  const official = classes.has("official");
  const secondary = classes.has("secondary");
  const privateEvidence = classes.has("private");
  if (official && !secondary && !privateEvidence) return "official";
  if (secondary && !official && !privateEvidence) return "secondary_only";
  if (privateEvidence && !official && !secondary) return "private_only";
  return classes.size > 0 ? "mixed" : "none";
}
