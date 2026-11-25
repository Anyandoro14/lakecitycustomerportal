import { config } from "@/config";

interface DocuSignSigning {
  on(event: "ready" | "sessionEnd", cb: (e: { sessionEndType?: string }) => void): void;
  mount(selector: string): void;
}
interface DocuSignInstance {
  signing(opts: Record<string, unknown>): DocuSignSigning;
}
declare global {
  interface Window {
    DocuSign?: { loadDocuSign(integrationKey: string): Promise<DocuSignInstance> };
  }
}

let loader: Promise<void> | null = null;

function loadScript(): Promise<void> {
  loader ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = config.docusignJsUrl;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loader = null;
      reject(new Error("Could not load DocuSign JS"));
    };
    document.head.appendChild(s);
  });
  return loader;
}

/**
 * Mounts DocuSign Focused View (embedded iframe) into `selector`.
 * Throws if the JS bundle can't load, so the caller can fall back to classic redirect signing.
 */
export async function mountFocusedView(opts: {
  integrationKey: string;
  url: string;
  selector: string;
  onReady: () => void;
  onSessionEnd: (type: string) => void;
}) {
  await loadScript();
  if (!window.DocuSign) throw new Error("DocuSign JS unavailable");
  const docusign = await window.DocuSign.loadDocuSign(opts.integrationKey);
  const signing = docusign.signing({
    url: opts.url,
    displayFormat: "focused",
    style: {
      branding: { primaryButton: { backgroundColor: "#0b3d2e", color: "#ffffff" } },
      signingNavigationButton: { finishText: "Finish signing", position: "bottom-center" },
    },
  });
  signing.on("ready", () => opts.onReady());
  signing.on("sessionEnd", (e) => opts.onSessionEnd(e.sessionEndType ?? "unknown"));
  signing.mount(opts.selector);
}
