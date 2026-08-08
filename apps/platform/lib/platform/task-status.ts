import type { ActionPlanStepPatch } from "./action-plan";

export type TaskStatus =
  | "planned"
  | "in_progress"
  | "waiting_information"
  | "waiting_counterparty"
  | "overdue"
  | "completed"
  | "cancelled";

export function taskStatusForPlanStep(status: ActionPlanStepPatch["status"]): TaskStatus {
  switch (status) {
    case "not_started": return "planned";
    case "waiting_user": return "waiting_information";
    case "waiting_response": return "waiting_counterparty";
    default: return status;
  }
}

export function taskStatusIsTerminal(status: TaskStatus): boolean {
  return status === "completed" || status === "cancelled";
}
