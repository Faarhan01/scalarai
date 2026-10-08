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

export interface EaValidationResult {
  valid: boolean;
  error?: string;
  version?: string;
}

export function validateEaCode(code: string): EaValidationResult {
  if (!code || typeof code !== "string") {
    return { valid: false, error: "Empty or invalid code string" };
  }
  if (code.length < 1500) {
    return { valid: false, error: "Code too short (must be complete EA, at least 1500 characters)" };
  }
  if (!code.includes("OnInit")) {
    return { valid: false, error: "Missing required 'OnInit()' entry point" };
  }
  if (!code.includes("OnTick")) {
    return { valid: false, error: "Missing required 'OnTick()' event handler" };
  }
  if (!code.includes("<Trade\\Trade.mqh>") && !code.includes("<Trade/Trade.mqh>")) {
    return { valid: false, error: "Missing required '#include <Trade\\Trade.mqh>' standard library" };
  }
  if (!code.includes("CTrade")) {
    return { valid: false, error: "Missing 'CTrade trade' trade execution instance" };
  }
  if (!code.includes("InpWebServerUrl")) {
    return { valid: false, error: "Missing required 'InpWebServerUrl' input parameter" };
  }
  if (!code.includes("WebRequest")) {
    return { valid: false, error: "Missing required 'WebRequest' API communication calls" };
  }
  if (code.includes("SYMBOL_FILLING_RETURN")) {
    return { valid: false, error: "Contains illegal identifier 'SYMBOL_FILLING_RETURN' (causes MT5 compiler error)" };
  }

  const versionMatch = code.match(/#property\s+version\s+"([^"]+)"/);
  const version = versionMatch ? versionMatch[1] : undefined;

  return { valid: true, version };
}

export function getCustomEaTemplate(): string | null {
  const customPath = getCustomEaTemplatePath();
  try {
    if (fs.existsSync(customPath)) {
      const code = fs.readFileSync(customPath, "utf-8");
      const validation = validateEaCode(code);
      if (validation.valid) {
        return code;
      } else {
        console.warn(`[EA TEMPLATE] Custom template on disk failed validation: ${validation.error}. Falling back to master generator.`);
      }
    }
  } catch (err) {
    console.warn("[EA TEMPLATE] Failed to read custom template:", err);
  }
  return null;
}

export function isCustomTemplateActive(): boolean {
  return getCustomEaTemplate() !== null;
}

export function getCustomTemplateStatus(): { active: boolean; valid: boolean; version?: string; error?: string } {
  const customPath = getCustomEaTemplatePath();
  try {
    if (fs.existsSync(customPath)) {
      const code = fs.readFileSync(customPath, "utf-8");
      const validation = validateEaCode(code);
      return {
        active: true,
        valid: validation.valid,
        version: validation.version,
        error: validation.error,
      };
    }
  } catch (err: unknown) {
    return { active: false, valid: false, error: err instanceof Error ? err.message : String(err) };
  }
  return { active: false, valid: true };
}

export function resetCustomEaTemplate(): boolean {
  const customPath = getCustomEaTemplatePath();
  try {
    if (fs.existsSync(customPath)) {
      fs.unlinkSync(customPath);
      console.log("[EA TEMPLATE] Custom template removed. Official master template restored.");
    }
    return true;
  } catch (err) {
    console.error("[EA TEMPLATE] Failed to remove custom template:", err);
    return false;
  }
}

export function saveCustomEaTemplate(code: string): { success: boolean; error?: string } {
  const validation = validateEaCode(code);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }
  const customPath = getCustomEaTemplatePath();
  try {
    fs.mkdirSync(path.dirname(customPath), { recursive: true });
    fs.writeFileSync(customPath, code, "utf-8");
    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Filesystem error: ${errorMsg}` };
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
