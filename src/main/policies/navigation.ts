export function normalizeHttpUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) {
    throw new Error("Enter a web address up to 2,048 characters.");
  }

  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(candidate);
  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS addresses are allowed.");
  }
  if (!url.hostname) {
    throw new Error("The address must include a hostname.");
  }
  return url.toString();
}

export function isAllowedRemoteNavigation(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "https:" || url.href === "about:blank";
  } catch {
    return false;
  }
}
