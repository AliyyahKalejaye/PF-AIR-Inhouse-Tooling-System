// Per-status color + label lookup for the ECR list/detail status pills —
// same shape as lib/project-status.ts. Amber for Submitted (awaiting
// review, matches "Low Stock"/"Paused" elsewhere), emerald for Approved,
// rose for Rejected, indigo for Implemented (closed out, matches "Done").

import type { ECRStatus } from "./ecr";

export interface ECRStatusStyle {
  label: string;
  dot: string;
  pill: string;
}

const STYLES: Record<ECRStatus, ECRStatusStyle> = {
  submitted: {
    label: "Awaiting review",
    dot: "bg-amber-500",
    pill: "bg-amber-50",
  },
  approved: {
    label: "Approved",
    dot: "bg-emerald-500",
    pill: "bg-emerald-50 text-emerald-700",
  },
  rejected: {
    label: "Rejected",
    dot: "bg-rose-500",
    pill: "bg-rose-50 text-rose-700",
  },
  implemented: {
    label: "Implemented",
    dot: "bg-indigo-600",
    pill: "bg-indigo-50 text-indigo-700",
  },
};

// Same reasoning as PAUSED_TEXT_COLOR in lib/project-status.ts — the
// amber-700-ish hue used for "Low Stock"/"Paused" text elsewhere in the
// app doesn't match Tailwind's amber-700 utility exactly.
export const SUBMITTED_TEXT_COLOR = "#b45309";

export function ecrStatusStyle(status: ECRStatus): ECRStatusStyle {
  return STYLES[status];
}

// Section order for the grouped list page — open items first (what a
// reviewer needs to act on), then the two closed-out states.
export const ECR_STATUS_ORDER: ECRStatus[] = [
  "submitted",
  "approved",
  "rejected",
  "implemented",
];
