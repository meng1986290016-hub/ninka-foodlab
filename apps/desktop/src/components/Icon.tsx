import type { ReactNode } from "react";

export type IconName =
  | "archive"
  | "arrow-down"
  | "arrow-up"
  | "check"
  | "chevron-down"
  | "close"
  | "copy"
  | "database"
  | "edit"
  | "flask"
  | "formula"
  | "grip"
  | "ingredients"
  | "lock"
  | "message"
  | "more"
  | "paperclip"
  | "plus"
  | "search"
  | "scale"
  | "send"
  | "settings"
  | "trash"
  | "trend"
  | "unlock"
  | "warning";

const paths: Record<IconName, ReactNode> = {
  archive: (
    <>
      <path d="M4 7h16" />
      <path d="M9 11v6m6-6v6" />
      <path d="m6 7 1 14h10l1-14M9 7l1-3h4l1 3" />
    </>
  ),
  "arrow-down": (
    <>
      <path d="M12 5v14" />
      <path d="m7 14 5 5 5-5" />
    </>
  ),
  "arrow-up": (
    <>
      <path d="M12 19V5" />
      <path d="m7 10 5-5 5 5" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  "chevron-down": <path d="m7 10 5 5 5-5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  copy: (
    <>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5" rx="7" ry="3" />
      <path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
      <path d="M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7" />
    </>
  ),
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
    </>
  ),
  flask: (
    <>
      <path d="M9 3h6M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3" />
      <path d="M7.5 15h9" />
    </>
  ),
  formula: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  grip: (
    <>
      <circle cx="8" cy="6" r=".8" fill="currentColor" stroke="none" />
      <circle cx="16" cy="6" r=".8" fill="currentColor" stroke="none" />
      <circle cx="8" cy="12" r=".8" fill="currentColor" stroke="none" />
      <circle cx="16" cy="12" r=".8" fill="currentColor" stroke="none" />
      <circle cx="8" cy="18" r=".8" fill="currentColor" stroke="none" />
      <circle cx="16" cy="18" r=".8" fill="currentColor" stroke="none" />
    </>
  ),
  ingredients: (
    <>
      <rect x="4" y="7" width="16" height="13" rx="2" />
      <path d="M7 7V4h10v3M8 12h8M8 16h5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
    </>
  ),
  message: (
    <>
      <path d="M21 12a8 8 0 0 1-8 8H6l-4 2 1.5-4A9 9 0 1 1 21 12Z" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  paperclip: (
    <path d="m20 11.5-8.3 8.3a5 5 0 0 1-7.1-7.1l9-9a3.5 3.5 0 0 1 5 5l-9.1 9.1a2 2 0 0 1-2.8-2.8l8.4-8.4" />
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  scale: (
    <>
      <path d="M12 3v18M5 6h14M7 6l-4 7h8L7 6Zm10 0-4 7h8l-4-7Z" />
      <path d="M8 21h8" />
    </>
  ),
  send: (
    <>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 11v6m6-6v6" />
      <path d="m6 7 1 14h10l1-14M9 7l1-3h4l1 3" />
    </>
  ),
  trend: (
    <>
      <path d="M4 19V5M4 19h16" />
      <path d="m7 15 4-4 3 2 5-6" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 7.5-2M12 14v3" />
    </>
  ),
  warning: (
    <>
      <path d="M10.3 4.2 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
};

interface IconProps {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 20 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <g
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      >
        {paths[name]}
      </g>
    </svg>
  );
}
