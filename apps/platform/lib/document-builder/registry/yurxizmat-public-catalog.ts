import { YURXIZMAT_CONTRACTS } from "./yurxizmat-public-contracts";
import { YURXIZMAT_STATEMENTS } from "./yurxizmat-public-statements";
import { YURXIZMAT_PERSONAL_DOCUMENTS } from "./yurxizmat-public-personal";
import { YURXIZMAT_NOTARIAL } from "./yurxizmat-public-notarial";
import { YURXIZMAT_COURT_A } from "./yurxizmat-public-court-a";
import { YURXIZMAT_COURT_B } from "./yurxizmat-public-court-b";
import { YURXIZMAT_CORPORATE } from "./yurxizmat-public-corporate";

/**
 * Public metadata snapshot audited on 2026-07-24.
 * Only factual titles, IDs, category labels and URLs are retained.
 * No document body, explanation, design or source code is copied.
 */
export const YURXIZMAT_PUBLIC_CATALOG = [
  ...YURXIZMAT_CONTRACTS,
  ...YURXIZMAT_STATEMENTS,
  ...YURXIZMAT_PERSONAL_DOCUMENTS,
  ...YURXIZMAT_NOTARIAL,
  ...YURXIZMAT_COURT_A,
  ...YURXIZMAT_COURT_B,
  ...YURXIZMAT_CORPORATE,
] as const;
