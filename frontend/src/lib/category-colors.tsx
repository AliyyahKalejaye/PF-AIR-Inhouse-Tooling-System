// Per-category color + icon lookup for the Inventory table's thumbnail and
// category badge. The four core categories (aerospace-uav, electronics,
// mechanical, power-battery) match the exact hues from the approved
// inventory_mockup.html (thumb-aero/elec/mech/power, badge-aero/elec/mech/
// power). Sensors and Fasteners weren't in the original 4-color mockup set
// (it only showed 8 sample rows), so they extend the same visual language
// with two more of the design system's existing hues rather than inventing
// new ones — cyan for sensors was already taken by electronics, so sensors
// gets emerald and fasteners gets slate, both already in the palette.
import type { ReactNode } from "react";

export interface CategoryStyle {
  badge: string;
  thumbBg: string;
  thumbText: string;
  icon: "aero" | "elec" | "mech" | "power" | "sensor" | "fastener" | "default";
}

const STYLES: Record<string, CategoryStyle> = {
  "aerospace-uav": {
    badge: "bg-indigo-50 text-indigo-700",
    thumbBg: "bg-indigo-50",
    thumbText: "text-indigo-700",
    icon: "aero",
  },
  electronics: {
    badge: "bg-cyan-50 text-cyan-600",
    thumbBg: "bg-cyan-50",
    thumbText: "text-cyan-600",
    icon: "elec",
  },
  mechanical: {
    badge: "bg-orange-50 text-orange-700",
    thumbBg: "bg-orange-50",
    thumbText: "text-orange-700",
    icon: "mech",
  },
  "power-battery": {
    badge: "bg-purple-50 text-purple-700",
    thumbBg: "bg-purple-50",
    thumbText: "text-purple-700",
    icon: "power",
  },
  sensors: {
    badge: "bg-emerald-50 text-emerald-700",
    thumbBg: "bg-emerald-50",
    thumbText: "text-emerald-700",
    icon: "sensor",
  },
  fasteners: {
    badge: "bg-slate-100 text-slate-600",
    thumbBg: "bg-slate-100",
    thumbText: "text-slate-600",
    icon: "fastener",
  },
};

const DEFAULT_STYLE: CategoryStyle = {
  badge: "bg-slate-100 text-slate-600",
  thumbBg: "bg-slate-100",
  thumbText: "text-slate-500",
  icon: "default",
};

export function categoryStyle(slug: string | null | undefined): CategoryStyle {
  if (!slug) return DEFAULT_STYLE;
  return STYLES[slug] ?? DEFAULT_STYLE;
}

// Category icon paths lifted directly from inventory_mockup.html's per-row
// thumbnails (aero/elec/mech/power); sensor + fastener are new but drawn in
// the same 24x24 stroke-based style as the rest of the icon set.
export function CategoryIcon({ icon, className }: { icon: CategoryStyle["icon"]; className?: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  };

  const paths: Record<CategoryStyle["icon"], ReactNode> = {
    aero: (
      <svg {...common}>
        <path d="M22 2L11 13" />
        <path d="M22 2l-7 20-4-9-9-4 20-7z" />
      </svg>
    ),
    elec: (
      <svg {...common}>
        <rect x="6" y="6" width="12" height="12" rx="2" />
        <rect x="9" y="9" width="6" height="6" rx="1" />
        <path d="M6 2v3M12 2v3M18 2v3M6 19v3M12 19v3M18 19v3M2 6h3M2 12h3M2 18h3M19 6h3M19 12h3M19 18h3" />
      </svg>
    ),
    mech: (
      <svg {...common}>
        <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
      </svg>
    ),
    power: (
      <svg {...common}>
        <rect x="1" y="7" width="18" height="10" rx="2" />
        <line x1="23" y1="11" x2="23" y2="13" />
        <path d="M6 12h8" />
      </svg>
    ),
    sensor: (
      <svg {...common}>
        <circle cx="12" cy="12" r="2.5" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        <path d="M5 5l2.1 2.1M16.9 16.9L19 19M19 5l-2.1 2.1M7.1 16.9L5 19" />
      </svg>
    ),
    fastener: (
      <svg {...common}>
        <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
      </svg>
    ),
    default: (
      <svg {...common}>
        <rect x="3" y="3" width="18" height="18" rx="3" />
      </svg>
    ),
  };

  return <>{paths[icon]}</>;
}
