/* Shared panel UI: renders the status indicator and the command log.
   Loaded by both the real panel (with main.js) and preview.html (with a
   mock driver). Exposes log(), setStatus(), clearLog() as globals so the
   rest of main.js keeps calling them unchanged. */
(function () {
  var cmdCount = 0;

  function byId(id) { return document.getElementById(id); }

  function classify(msg) {
    if (msg.charAt(0) === "←") return "in";          // "←" inbound command
    if (msg.charAt(0) === "→") return "out";         // "→" outbound response
    if (/error|failed|not ready/i.test(msg)) return "err";
    return "sys";
  }

  window.setStatus = function (text, className) {
    var s = byId("status");
    if (!s) return;
    s.className = "status " + (className || "");
    var label = s.querySelector(".status-label");
    if (label) label.textContent = text;
  };

  window.log = function (msg) {
    var box = byId("log");
    if (!box) return;

    var empty = byId("logEmpty");
    if (empty) empty.style.display = "none";

    var kind = classify(msg);
    var row = document.createElement("div");
    row.className = "logline " + kind;

    var ts = document.createElement("span");
    ts.className = "ts";
    ts.textContent = new Date().toLocaleTimeString([], { hour12: false });

    var m = document.createElement("span");
    m.className = "msg";
    m.textContent = msg;

    row.appendChild(ts);
    row.appendChild(m);
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;

    if (kind === "in") {
      cmdCount++;
      var c = byId("count");
      if (c) c.textContent = cmdCount;
    }

    // ponytail: hard cap on log rows; drop oldest. Raise if you need deeper history.
    while (box.childNodes.length > 500) box.removeChild(box.firstChild);
  };

  window.clearLog = function () {
    var box = byId("log");
    if (box) box.innerHTML = "";
    cmdCount = 0;
    var c = byId("count");
    if (c) c.textContent = "0";
    var empty = byId("logEmpty");
    if (empty) empty.style.display = "";
  };
})();
