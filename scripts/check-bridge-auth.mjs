// Live check: run with a bridge owner up and the panel connected: node scripts/check-bridge-auth.mjs
import WebSocket from "ws"; import { readFileSync } from "fs"; import { homedir } from "os";
const tok = readFileSync(homedir()+"/.premiere-mcp-bridge/relay-8097.token","utf8").trim();
const tryc = (name, url, opts) => new Promise(r => { const w = new WebSocket(url, opts);
  w.on("open", () => { w.send(JSON.stringify({id:"1",functionName:"getProjectInfo",args:[]})); });
  w.on("message", d => { const m = JSON.parse(d); if (m.id) { r(`${name}: OPEN, call -> ${m.error ? "error " + m.error : "ok"}`); w.close(); } });
  w.on("unexpected-response", (_q, res) => r(`${name}: REJECTED ${res.statusCode}`));
  w.on("error", e => r(`${name}: ERROR ${e.message}`)); setTimeout(() => r(`${name}: open, no reply`), 8000); });
const U = "ws://127.0.0.1:8097/relay";
const res = [
  await tryc("relay no token", U),
  await tryc("relay wrong token", U, { headers: { "x-relay-token": "x" } }),
  await tryc("relay token + browser Origin", U, { headers: { "x-relay-token": tok }, origin: "https://evil.example" }),
  await tryc("panel path from web page", "ws://127.0.0.1:8097/", { origin: "https://evil.example" }),
  await tryc("panel path, null origin", "ws://127.0.0.1:8097/", { origin: "null" }),
  await tryc("2nd panel while one attached", "ws://127.0.0.1:8097/", { origin: "file://" }),
  await tryc("relay with token", U, { headers: { "x-relay-token": tok } }),
];
console.log(res.join("\n"));
const ok = res[0].includes("REJECTED") && res[1].includes("REJECTED") && res[2].includes("REJECTED") && res[3].includes("REJECTED") && res[4].includes("REJECTED") && res[5].includes("REJECTED") && res[6].includes("call -> ok");
console.log(ok ? "PASS" : "FAIL"); process.exit(ok ? 0 : 1);
