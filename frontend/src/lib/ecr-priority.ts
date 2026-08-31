// Per-priority color + label lookup for the ECR list/detail priority
// badges — same shape as lib/ecr-status.ts. Rose for Urgent (needs eyes
// now), amber for High, slate for Medium (the default — most requests
// shouldn't need to stand out), and a quieter slate for Low.

import type { ECRPriority } from "./ecr";

export interface ECRPriorityStyle {
  label: string;
  pill: string;
}

const STYLES: Record<ECRPriority, ECRPriorityStyle> = {
  urgent: {
    label: "Urgent",
    pill: "bg-rose-50 text-rose-700",
  },
  high: {
    label: "High",
    pill: "bg-amber-50 text-amber-700",
  },
  medium: {
    label: "Medium",
    pill: "bg-slate-100 text-slate-600",
  },
  low: {
    label: "Low",
    pill: "bg-slate-100 text-slate-500",
  },
};

export function ecrPriorityStyle(priority: ECRPriority): ECRPriorityStyle {
  return STYLES[priority];
}

// Highest-attention first — used to sort each status group so an admin's
// queue surfaces what needs review soonest, not just what was filed most
// recently.
export const ECR_PRIORITY_ORDER: ECRPriority[] = ["urgent", "high", "medium", "low"];

export function ecrPriorityRank(priority: ECRPriority): number {
  return ECR_PRIORITY_ORDER.indexOf(priority);
}
