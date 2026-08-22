export const LAWYER_TRIAL_DAYS = 90;
export const LAWYER_TRIAL_DURATION_MS = LAWYER_TRIAL_DAYS * 24 * 60 * 60 * 1_000;

export type LawyerTrialRow = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: "active" | "extended" | "converted" | "disabled";
  postExpiryMode: "stay_published" | "limit_new_requests" | "hide_profile";
};

export type LawyerTrialView = LawyerTrialRow & {
  effectiveStatus: "active" | "expired" | "converted" | "disabled";
  daysRemaining: number;
};

export function lawyerTrialEndsAt(startsAt: string): string {
  const start = new Date(startsAt).getTime();
  if (!Number.isFinite(start)) throw new Error("INVALID_LAWYER_TRIAL_START");
  return new Date(start + LAWYER_TRIAL_DURATION_MS).toISOString();
}

export function lawyerTrialView(
  row: LawyerTrialRow,
  now = Date.now(),
): LawyerTrialView {
  const endsAt = new Date(row.endsAt).getTime();
  const expired = Number.isFinite(endsAt) && endsAt <= now;
  const effectiveStatus = row.status === "converted"
    ? "converted"
    : row.status === "disabled"
      ? "disabled"
      : expired
        ? "expired"
        : "active";
  return {
    ...row,
    effectiveStatus,
    daysRemaining: effectiveStatus === "active"
      ? Math.max(0, Math.ceil((endsAt - now) / 86_400_000))
      : 0,
  };
}
