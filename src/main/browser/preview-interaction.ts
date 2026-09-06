const LEGACY_SCROLL_LOCK_KEY = "__latticePreviewScrollLock";
const PREVIEW_SCROLLBAR_STYLE_ID = "__latticePreviewScrollbarStyle";
const PREVIEW_SCROLLBAR_CSS = `
  * {
    scrollbar-width: thin !important;
    scrollbar-color: rgba(82, 82, 92, 0.42) transparent !important;
  }
  *::-webkit-scrollbar {
    width: 3px !important;
    height: 3px !important;
  }
  *::-webkit-scrollbar-track,
  *::-webkit-scrollbar-corner {
    background: transparent !important;
  }
  *::-webkit-scrollbar-thumb {
    min-width: 3px !important;
    min-height: 18px !important;
    border: 0 !important;
    border-radius: 999px !important;
    background: rgba(82, 82, 92, 0.42) !important;
  }
  *::-webkit-scrollbar-thumb:hover {
    background: rgba(82, 82, 92, 0.68) !important;
  }
`;

export interface TabViewVisibilityState {
  browserVisible: boolean;
  isActive: boolean;
  isLivePreview: boolean;
}

export function shouldShowTabView(state: TabViewVisibilityState): boolean {
  return state.isLivePreview || (state.browserVisible && state.isActive);
}

export function previewInteractionScript(enabled: boolean): string {
  return `(() => {
    const key = ${JSON.stringify(LEGACY_SCROLL_LOCK_KEY)};
    const styleId = ${JSON.stringify(PREVIEW_SCROLLBAR_STYLE_ID)};
    const previous = window[key];
    if (previous) {
      window.removeEventListener("wheel", previous.block, true);
      window.removeEventListener("touchmove", previous.block, true);
      window.removeEventListener("scroll", previous.reset, true);
      delete window[key];
    }

    document.getElementById(styleId)?.remove();
    if (!${enabled}) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = ${JSON.stringify(PREVIEW_SCROLLBAR_CSS)};
    (document.head || document.documentElement).appendChild(style);
  })()`;
}
