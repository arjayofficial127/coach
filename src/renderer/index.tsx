import React from "react";
import ReactDOM from "react-dom/client";
import { LatticeApp } from "./lattice-app";
import "./styles.css";

async function bootstrap(): Promise<void> {
  if (import.meta.env.DEV && !window.lattice) {
    const { installBrowserPreviewBridge } = await import("./browser-preview");
    installBrowserPreviewBridge();
  }

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <LatticeApp />
    </React.StrictMode>,
  );
}

void bootstrap();
