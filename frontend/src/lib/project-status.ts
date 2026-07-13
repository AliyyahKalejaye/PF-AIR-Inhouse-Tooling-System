// Per-status color + label lookup for the Projects list/detail status
// pills and section dividers — same visual language and file shape as
// lib/category-colors.tsx, just keyed by ProjectStatus instead of a
// category slug. Colors match the approved 08_projects_list mockup: green
// for Active, indigo for Done, amber for Paused, slate for Relegated.

import type { ProjectStatus } from "./projects";

export interface ProjectStatusStyle {
  label: string;
  dot: string;
  pill: string;
}

const STYLES: Record<ProjectStatus, ProjectStatusStyle> = {
  active: {
    label: "Active",
    dot: "bg-emerald-500",
    pill: "bg-emerald-50 text-emerald-700",
  },
  done: {
    label: "Done",
    dot: "bg-indigo-600",
    pill: "bg-indigo-50 text-indigo-700",
  },
  paused: {
    label: "Paused",
    dot: "bg-amber-500",
    pill: "bg-amber-50",
  },
  relegated: {
    label: "Relegated",
    dot: "bg-slate-400",
    pill: "bg-slate-100 text-slate-600",
  },
};

// Paused's pill text color is an inline style, not a Tailwind class, to
// match the exact #b45309 amber-700-ish hue used for "Low Stock" /
// "Paused" text elsewhere in the app (see InventoryContent's low-stock
// stat card) — Tailwind's amber-700 utility renders slightly different.
export const PAUSED_TEXT_COLOR = "#b45309";

export function projectStatusStyle(status: ProjectStatus): ProjectStatusStyle {
  return STYLES[status];
}

// Section order for the grouped list page — matches the mockup's
// Active → Done → Paused → Relegated ordering.
export const PROJECT_STATUS_ORDER: ProjectStatus[] = ["active", "done", "paused", "relegated"];
