import type { ReactNode } from "react";
import {
  DESKTOP_ICON_CATALOG,
  desktopFallbackIconId,
  type DesktopIconSelection,
} from "./desktop-icon-model";

const familyLines: ReactNode[] = [
  <circle key="orbit" cx="12" cy="12" r="8.5" />,
  <rect key="window" x="4" y="4" width="16" height="16" rx="3" />,
  <path key="compass" d="M12 3 20 12 12 21 4 12Z" />,
  <path key="beacon" d="M6 20h12M8 16h8M10 12h4M12 3v5" />,
  <path key="horizon" d="M3 15h18M5 18h14M7 11a5 5 0 0 1 10 0" />,
  <path
    key="bloom"
    d="M12 12c-5-1-6-7-2-8 2-.5 3 2 2 8Zm0 0c1-5 7-6 8-2 .5 2-2 3-8 2Zm0 0c5 1 6 7 2 8-2 .5-3-2-2-8Zm0 0c-1 5-7 6-8 2-.5-2 2-3 8-2Z"
  />,
  <path key="circuit" d="M4 7h5l3 5h8M4 17h5l3-5M4 7V4M4 20v-3M20 12v4" />,
  <path key="peak" d="m3 19 6-10 3 5 3-8 6 13Z" />,
  <path key="wave" d="M3 9c3-4 6-4 9 0s6 4 9 0M3 15c3-4 6-4 9 0s6 4 9 0" />,
  <path key="portal" d="M5 20V9a7 7 0 0 1 14 0v11M9 20V10a3 3 0 0 1 6 0v10" />,
];

const markLines: ReactNode[] = [
  <circle key="dot" cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />,
  <path key="cross" d="M9 12h6M12 9v6" />,
  <path key="spark" d="m12 8 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" />,
  <path key="path" d="m9 15 6-6M10 9h5v5" />,
  <path key="moon" d="M15 15a4.2 4.2 0 0 1-5.8-5.8A4.2 4.2 0 1 0 15 15Z" />,
  <circle key="sun" cx="12" cy="12" r="3" />,
  <path key="leaf" d="M8 15c0-5 3-7 8-7 0 5-2 8-7 8m-1 1 5-5" />,
  <path key="bolt" d="m13 7-4 6h3l-1 5 5-7h-3Z" />,
  <path
    key="link"
    d="M10 9 9 8a3 3 0 0 0-4 4l2 2a3 3 0 0 0 4 0m3 1 1 1a3 3 0 0 0 4-4l-2-2a3 3 0 0 0-4 0m-4 4 6-6"
  />,
  <path key="crown" d="m8 15-1-6 4 3 2-4 2 4 4-3-1 6Z" />,
];

export function DesktopIconGraphic({
  icon,
  color = "violet",
}: {
  icon?: DesktopIconSelection;
  color?: "violet" | "cyan" | "amber" | "rose" | "lime";
}) {
  if (icon?.type === "image") return <img src={icon.dataUrl} alt="" />;
  const iconId = icon?.type === "builtin" ? icon.id : desktopFallbackIconId(color);
  const option = DESKTOP_ICON_CATALOG.find((candidate) => candidate.id === iconId);
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {familyLines[option?.familyIndex ?? 0]}
      {markLines[option?.markIndex ?? 0]}
    </svg>
  );
}
