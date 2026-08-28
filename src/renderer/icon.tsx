import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "arrow-left"
  | "arrow-right"
  | "bookmark"
  | "check"
  | "chevron-down"
  | "close"
  | "command"
  | "desktop"
  | "edit"
  | "folder"
  | "globe"
  | "grid"
  | "home"
  | "library"
  | "lock"
  | "more"
  | "plus"
  | "reload"
  | "search"
  | "settings"
  | "sparkle"
  | "timer";

const paths: Record<IconName, ReactNode> = {
  "arrow-left": <path d="m15 18-6-6 6-6" />,
  "arrow-right": <path d="m9 18 6-6-6-6" />,
  bookmark: <path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-3.6L6 21Z" />,
  check: <path d="m5 12.5 4.2 4.2L19 7" />,
  "chevron-down": <path d="m7 10 5 5 5-5" />,
  close: <path d="m7 7 10 10M17 7 7 17" />,
  command: (
    <path d="M9 6V4.5a2.5 2.5 0 1 0-2.5 2.5H18M15 18v1.5a2.5 2.5 0 1 0 2.5-2.5H6M6 7a2.5 2.5 0 1 0 0 5h12a2.5 2.5 0 1 0 0 5H6" />
  ),
  desktop: <path d="M4 5h16v11H4zM9 20h6M12 16v4" />,
  edit: <path d="M4 20h4l11-11-4-4L4 16v4ZM13.5 6.5l4 4" />,
  folder: <path d="M3.5 6.5h6l2-2h9v15h-17z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  grid: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
  home: <path d="m3 11 9-8 9 8M5.5 9.5V21h13V9.5M9.5 21v-7h5v7" />,
  library: <path d="M5 4h3v16H5zM10.5 4h3v16h-3zM16 5l3-1 4 15-3 1z" />,
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="19" cy="12" r="1" fill="currentColor" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  reload: <path d="M20 7v5h-5M4 17v-5h5M6.1 8A7 7 0 0 1 18.8 9.5M17.9 16A7 7 0 0 1 5.2 14.5" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  sparkle: (
    <path d="m12 2 1.2 4.2L17 8l-3.8 1.8L12 14l-1.2-4.2L7 8l3.8-1.8ZM5 14l.7 2.3L8 17l-2.3.7L5 20l-.7-2.3L2 17l2.3-.7ZM19 14l.6 1.8 1.9.7-1.9.7L19 19l-.6-1.8-1.9-.7 1.9-.7Z" />
  ),
  timer: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M9 2h6M12 5V2M17.7 7.3 19 6M12 9v4l2.6 1.6" />
    </>
  ),
};

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
