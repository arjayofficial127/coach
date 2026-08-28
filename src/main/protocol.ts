import path from "node:path";
import { pathToFileURL } from "node:url";
import { net, protocol, type Session } from "electron";
import { assertPathWithinRoot } from "./vault/atomic-note";

export const PACKAGED_SHELL_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'none'",
  "img-src 'self' data:",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

export function registerLatticeScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "lattice",
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
      },
    },
  ]);
}

export function installLatticeProtocol(shellSession: Session, rendererRoot: string): void {
  shellSession.protocol.handle("lattice", async (request) => {
    try {
      const requestUrl = new URL(request.url);
      if (
        requestUrl.hostname !== "app" ||
        requestUrl.username ||
        requestUrl.password ||
        requestUrl.port
      ) {
        return new Response("Not found", { status: 404 });
      }

      const decodedPath = decodeURIComponent(requestUrl.pathname);
      if (decodedPath.includes("\0")) {
        return new Response("Not found", { status: 404 });
      }
      const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
      const assetPath = path.resolve(rendererRoot, relativePath);
      assertPathWithinRoot(rendererRoot, assetPath);
      const response = await net.fetch(pathToFileURL(assetPath).toString());
      const headers = new Headers(response.headers);
      headers.set("X-Content-Type-Options", "nosniff");
      if (path.extname(assetPath).toLowerCase() === ".html") {
        headers.set("Content-Security-Policy", PACKAGED_SHELL_CSP);
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}
