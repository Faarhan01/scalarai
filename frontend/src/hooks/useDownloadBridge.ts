import { useCallback } from "react";

export interface BridgeDownloadConfig {
  appEndpoint?: string;
  mt5Path?: string;
}

export function useDownloadBridge(config: BridgeDownloadConfig) {
  const downloadNodejsBridge = useCallback(() => {
    const origin = config.appEndpoint || getAppBaseUrl();

    const jsBridgeScript = `/**
 * Step Index AI Scalper - Free MT5 Node.js Bridge Client
 * Auto-generated with target origin: ${origin}
 * Uses Node.js built-in https module - no external dependencies required.
 */
const https = require('https');
const http = require('http');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log("=================================================================");
console.log("⚡ STEP INDEX AI SCALPER - FREE NODE.JS MT5 BRIDGE CLIENT ⚡");
console.log("=================================================================");

const SERVER_URL = "${origin}";
let MT5_TERMINAL_PATH = "${config.mt5Path || "terminal64.exe"}";

function request(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks).toString()));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function pollTrades() {
  try {
    const pollUrl = SERVER_URL.endsWith('/') ? SERVER_URL + 'poll' : SERVER_URL + '/poll';
    const response = await request(pollUrl);
    const trades = JSON.parse(response);
    if (Array.isArray(trades) && trades.length > 0) {
      console.log(\`[\${new Date().toLocaleTimeString()}] Received \${trades.length} signal(s):\`, trades);
      for (const trade of trades) {
        const action = (trade.action || trade.type || "").toUpperCase();
        const symbol = trade.symbol || "Step Index";
        const volume = Number(trade.volume || 0.1);
        const sl = Number(trade.sl || 0);
        const tp = Number(trade.tp || 0);
        console.log(\`Executing \${action} on \${symbol} (Vol: \${volume}, SL: \${sl}, TP: \${tp})\`);
        const cmd = \`"\${MT5_TERMINAL_PATH}" /cmd:trade,action=\${action},symbol="\${symbol}",volume=\${volume},sl=\${sl},tp=\${tp}\`;
        exec(cmd, (err, stdout) => {
          if (stdout) console.log(stdout.trim());
        });
      }
    }
  } catch (err) {
    // transient
  }
}

setInterval(pollTrades, 1500);
console.log("Polling daemon started on " + SERVER_URL + " (Ctrl+C to stop)...");
`;

    const packageJsonContent = `{
  "name": "mt5-bridge-client",
  "version": "1.0.0",
  "main": "mt5_bridge.js",
  "scripts": {
    "start": "node mt5_bridge.js"
  }
}
`;
    const jsBlob = new Blob([jsBridgeScript], { type: "text/plain;charset=utf-8" });
    const jsUrl = URL.createObjectURL(jsBlob);
    const jsLink = document.createElement("a");
    jsLink.href = jsUrl;
    jsLink.setAttribute("download", "mt5_bridge.js");
    document.body.appendChild(jsLink);
    jsLink.click();
    document.body.removeChild(jsLink);
    URL.revokeObjectURL(jsUrl);

    setTimeout(() => {
      const pkgBlob = new Blob([packageJsonContent], { type: "application/json;charset=utf-8" });
      const pkgUrl = URL.createObjectURL(pkgBlob);
      const pkgLink = document.createElement("a");
      pkgLink.href = pkgUrl;
      pkgLink.setAttribute("download", "package.json");
      document.body.appendChild(pkgLink);
      pkgLink.click();
      document.body.removeChild(pkgLink);
      URL.revokeObjectURL(pkgUrl);
    }, 200);
  }, [config.appEndpoint, config.mt5Path]);

  return { downloadNodejsBridge };
}

function getAppBaseUrl(): string {
  const protocol = window.location.protocol;
  const host = window.location.host;
  const appEndpoint = (document.querySelector('meta[name="scalarai-app-endpoint"]') as HTMLMetaElement | null)?.content;
  if (appEndpoint && appEndpoint.length > 0) return appEndpoint;
  const parts = host.split(":");
  if (parts[0] === "localhost" || parts[0] === "127.0.0.1") {
    const port = parts[1] || "3000";
    return `${protocol}//localhost:${port}`;
  }
  return `${protocol}//${host}`;
}
