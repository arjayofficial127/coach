import { isLoopbackHostname, resolveNavigationInput } from "../../shared/lattice-search";

export function normalizeHttpUrl(input: string): string {
  return resolveNavigationInput(input);
}

export function isAllowedRemoteNavigation(input: string): boolean {
  try {
    const url = new URL(input);
    return (
      url.protocol === "https:" ||
      url.href === "about:blank" ||
      (url.protocol === "http:" && isLoopbackHostname(url.hostname))
    );
  } catch {
    return false;
  }
}
