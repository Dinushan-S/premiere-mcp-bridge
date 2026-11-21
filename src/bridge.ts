import { WebSocketServer, WebSocket } from "ws";
import { randomBytes } from "crypto";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { loadConfig } from "./config.js";

const WS_PORT = loadConfig().port;
const TIMEOUT_MS = 30000;
const REBIND_MS = 3000;
const RELAY_PATH = "/relay";
const HOST = "127.0.0.1"; // never expose the bridge to the network

// Relays can run any tool (including execute_extendscript), so they must prove
// they are this OS user: the owner writes a random token to a file in the
// user's home and relays send it back. Web pages can't read that file.
// ponytail: a local process that squats the port first could collect the token
// from relays; a challenge/response would close that, add if multi-user hosts matter.
const TOKEN_DIR = join(homedir(), ".premiere-mcp-bridge");
const TOKEN_FILE = join(TOKEN_DIR, `relay-${WS_PORT}.token`);

function writeToken(): string {
  const token = randomBytes(32).toString("hex");
  mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
  return token;
}

function readToken(): string {
  try {
    return readFileSync(TOKEN_FILE, "utf8").trim();
  } catch {
    return "";
  }
}

let ownerToken = "";

// Every MCP client (Claude, Codex, a second Claude window...) spawns its own
// server, but only one can bind WS_PORT. That one is the OWNER: the Premiere
// panel connects to it. Every other instance is a RELAY: it connects to the
// owner on /relay and the owner forwards its calls to the panel. So all clients
// work at once. If the owner exits, relays race to bind and one becomes owner.

let cepSocket: WebSocket | null = null; // owner only: the Premiere panel
let relaySocket: WebSocket | null = null; // relay only: link to the owner
let ownerPanelConnected = false; // relay only: owner's panel state
const relays = new Set<WebSocket>(); // owner only: connected relays

const pendingRequests = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();
let requestId = 0;

function settle(msg: any) {
  const pending = pendingRequests.get(msg.id);
  if (!pending) return;
  pendingRequests.delete(msg.id);
  if (msg.error) pending.reject(new Error(msg.error));
  else pending.resolve(msg.result);
}

function rejectAll(reason: string) {
  for (const [id, pending] of pendingRequests) {
    pending.reject(new Error(reason));
    pendingRequests.delete(id);
  }
}

function broadcastStatus() {
  const msg = JSON.stringify({ type: "status", connected: isConnected() });
  for (const r of relays) if (r.readyState === WebSocket.OPEN) r.send(msg);
}

function handleRelay(ws: WebSocket) {
  relays.add(ws);
  ws.send(JSON.stringify({ type: "status", connected: isConnected() }));
  ws.on("message", (data) => {
    let msg: any;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    callPremiere(msg.functionName, msg.args || []).then(
      (result) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ id: msg.id, result })),
      (e: Error) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ id: msg.id, error: e.message }))
    );
  });
  ws.on("close", () => relays.delete(ws));
}

function handlePanel(ws: WebSocket) {
  console.error(`[Bridge] CEP panel connected`);
  cepSocket = ws;
  broadcastStatus();

  ws.on("message", (data) => {
    try {
      settle(JSON.parse(data.toString()));
    } catch (e) {
      console.error("[Bridge] Failed to parse message:", e);
    }
  });

  ws.on("close", () => {
    console.error("[Bridge] CEP panel disconnected");
    if (cepSocket === ws) cepSocket = null;
    rejectAll("CEP panel disconnected");
    broadcastStatus();
  });
}

function connectAsRelay() {
  const ws = new WebSocket(`ws://${HOST}:${WS_PORT}${RELAY_PATH}`, {
    headers: { "x-relay-token": readToken() },
  });
  ws.on("open", () => {
    relaySocket = ws;
    console.error(`[Bridge] Port ${WS_PORT} owned by another instance; relaying through it`);
  });
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "status") ownerPanelConnected = !!msg.connected;
      else settle(msg);
    } catch {}
  });
  ws.on("error", () => {}); // "close" follows and handles it
  ws.on("close", () => {
    if (relaySocket === ws) relaySocket = null;
    ownerPanelConnected = false;
    rejectAll("Bridge owner went away");
    setTimeout(bind, REBIND_MS); // owner gone: try to take the port
  });
}

function bind() {
  const server = new WebSocketServer({
    host: HOST,
    port: WS_PORT,
    verifyClient: ({ origin, req }: { origin: string; req: import("http").IncomingMessage }) => {
      if (req.url === RELAY_PATH) {
        // Relays are Node processes: no browser Origin, and they hold the token.
        return !origin && !!ownerToken && req.headers["x-relay-token"] === ownerToken;
      }
      // Panel: refuse ordinary web pages (cross-site WebSocket hijacking).
      return !/^https?:/i.test(origin || "");
    },
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      try {
        server.close();
      } catch {}
      connectAsRelay();
    } else {
      console.error("[Bridge] WebSocket server error:", err);
    }
  });

  server.on("listening", () => {
    ownerToken = writeToken();
    console.error(`[Bridge] WebSocket server listening on ${HOST}:${WS_PORT}`);
  });

  server.on("connection", (ws, req) => {
    if (req.url === RELAY_PATH) handleRelay(ws);
    else handlePanel(ws);
  });
}

bind();

export function isConnected(): boolean {
  if (relaySocket) return relaySocket.readyState === WebSocket.OPEN && ownerPanelConnected;
  return cepSocket !== null && cepSocket.readyState === WebSocket.OPEN;
}

export function getPort(): number {
  return WS_PORT;
}

export function callPremiere(functionName: string, args: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!isConnected()) {
      reject(new Error("Premiere Pro is not connected. Make sure the MCP Bridge panel is open in Premiere Pro."));
      return;
    }

    const id = String(++requestId);
    pendingRequests.set(id, { resolve, reject });

    (relaySocket ?? cepSocket)!.send(JSON.stringify({ id, functionName, args }));

    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`Timeout waiting for Premiere Pro response (${functionName})`));
      }
    }, TIMEOUT_MS);
  });
}

export function toolResult(result: any) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
}
