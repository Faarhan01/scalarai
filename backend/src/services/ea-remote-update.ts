import fs from "fs";
import path from "path";

export interface EaVersionInfo {
  version: string;
  updateAvailable: boolean;
  serverVersion?: string;
  localVersion?: string;
}

export interface EaConfigUpdatePayload {
  lotSize?: number;
  stopLossPoints?: number;
  takeProfitPoints?: number;
  trailingStopPoints?: number;
  trailingStepPoints?: number;
  maxTrades?: number;
}

export interface EaRemoteUpdateDeps {
  getEaVersion: () => string;
  generateMql5Code: () => string;
  queueEaCommand: (command: { action: string; configUpdate?: EaConfigUpdatePayload; ticket?: number }) => void;
  onEaPositionsReport?: (positions: Array<Record<string, unknown>>) => void;
  onEaConfirmation?: (confirmation: Record<string, unknown>) => void;
}

function getCustomEaTemplatePath(): string {
  return path.join(process.cwd(), "backend", "generated-ea", "ScalarAI_MultiAsset_EA.mq5");
}

export function getCustomEaTemplate(): string | null {
  const customPath = getCustomEaTemplatePath();
  try {
    if (fs.existsSync(customPath)) {
      return fs.readFileSync(customPath, "utf-8");
    }
  } catch {
    // ignore
  }
  return null;
}

export function saveCustomEaTemplate(code: string): boolean {
  const customPath = getCustomEaTemplatePath();
  try {
    fs.mkdirSync(path.dirname(customPath), { recursive: true });
    fs.writeFileSync(customPath, code, "utf-8");
    return true;
  } catch {
    return false;
  }
}

export function getEaVersionInfo(deps: EaRemoteUpdateDeps): EaVersionInfo {
  const localVersion = deps.getEaVersion();
  let serverVersion: string | undefined;
  let updateAvailable = false;

  try {
    const code = deps.generateMql5Code();
    const match = code.match(/#property\s+version\s+"([^"]+)"/);
    serverVersion = match ? match[1] : undefined;
    if (serverVersion && serverVersion !== localVersion) {
      updateAvailable = true;
    }
  } catch {
    // ignore version check errors
  }

  return {
    version: localVersion,
    updateAvailable,
    serverVersion,
    localVersion,
  };
}

export function buildEaUpdatePromptHtml(info: EaVersionInfo): string {
  if (!info.updateAvailable || !info.serverVersion) {
    return "";
  }

  return `
Scalar AI EA Update Available

Server version : ${info.serverVersion}
Your version   : ${info.localVersion || "unknown"}

Action required:
1. Open MetaEditor
2. File -> Open -> MQL5/Files/ScalarAI_Update.mq5
3. Compile (F7)
4. Restart EA on chart

If MQL5/Files/ScalarAI_Update.mq5 does not exist yet, restart the EA or wait for the next sync.
`;
}
