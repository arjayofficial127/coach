export function isTrustedShellUrl(
  frameUrl: string,
  packaged: boolean,
  devServerUrl?: string,
): boolean {
  try {
    const actual = new URL(frameUrl);
    if (packaged) {
      return actual.protocol === "lattice:" && actual.hostname === "app";
    }
    return Boolean(devServerUrl && actual.origin === new URL(devServerUrl).origin);
  } catch {
    return false;
  }
}
