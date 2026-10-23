export interface ExplorerEndpoint {
  endpoint: string;
  description: string;
  example: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function card({ endpoint, description, example }: ExplorerEndpoint): string {
  return `<form class="endpoint">
  <h2><code>${escapeHtml(endpoint)}</code></h2>
  <p>${escapeHtml(description)}</p>
  <div class="row">
    <input name="path" value="${escapeHtml(example)}" aria-label="Request path for ${escapeHtml(endpoint)}" spellcheck="false" autocomplete="off">
    <button>Send</button>
  </div>
  <output hidden></output>
</form>`;
}

const STYLE = `
:root {
  color-scheme: light dark;
  --bg: #fafaf9; --fg: #1c1917; --muted: #57534e; --card: #fff;
  --border: #e7e5e4; --accent: #2563eb; --on-accent: #fff;
  --ok: #15803d; --err: #b91c1c;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1c1917; --fg: #f5f5f4; --muted: #a8a29e; --card: #292524;
    --border: #44403c; --accent: #60a5fa; --on-accent: #172554;
    --ok: #4ade80; --err: #f87171;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 2rem 1rem; background: var(--bg); color: var(--fg);
  font: 16px/1.5 system-ui, sans-serif;
}
main { max-width: 52rem; margin: 0 auto; }
h1 { margin: 0 0 .25rem; }
header p { margin: 0 0 2rem; color: var(--muted); }
a { color: var(--accent); }
code, input, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.endpoint {
  background: var(--card); border: 1px solid var(--border);
  border-radius: .5rem; padding: 1rem; margin-bottom: 1rem;
}
.endpoint h2 { font-size: 1rem; margin: 0; }
.endpoint p { margin: .25rem 0 .75rem; color: var(--muted); }
.row { display: flex; gap: .5rem; }
input {
  flex: 1; min-width: 0; padding: .4rem .6rem; font-size: .9rem;
  color: inherit; background: var(--bg); border: 1px solid var(--border);
  border-radius: .375rem;
}
button {
  padding: .4rem 1rem; font: inherit; color: var(--on-accent); background: var(--accent);
  border: 0; border-radius: .375rem; cursor: pointer;
}
output { display: block; margin-top: .75rem; }
.status { font-size: .875rem; color: var(--muted); }
.status b.ok { color: var(--ok); }
.status b.err { color: var(--err); }
pre {
  margin: .5rem 0 0; padding: .75rem; max-height: 24rem; overflow: auto;
  font-size: .8rem; background: var(--bg); border: 1px solid var(--border);
  border-radius: .375rem;
}
`;

const SCRIPT = `
for (const form of document.querySelectorAll("form.endpoint")) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const output = form.querySelector("output");
    const path = form.elements.path.value.trim();
    output.hidden = false;
    output.textContent = "Loading…";
    const started = performance.now();
    try {
      const res = await fetch(path, { headers: { Accept: "application/json" } });
      const ms = Math.round(performance.now() - started);
      const text = await res.text();
      let body = text;
      try { body = JSON.stringify(JSON.parse(text), null, 2); } catch {}
      const status = document.createElement("div");
      status.className = "status";
      const code = document.createElement("b");
      code.className = res.ok ? "ok" : "err";
      code.textContent = res.status + " " + res.statusText;
      const link = document.createElement("a");
      link.href = path;
      link.textContent = path;
      status.append(code, " · " + ms + " ms · ", link);
      const pre = document.createElement("pre");
      pre.textContent = body;
      output.replaceChildren(status, pre);
    } catch (error) {
      output.textContent = String(error);
    }
  });
}
`;

export function explorer(endpoints: ExplorerEndpoint[]): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>apis.is explorer</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<header>
  <h1>apis.is</h1>
  <p>Icelandic public APIs. Edit a path and send it to see the response. Add <code>?pretty=true</code> to any request for indented JSON.</p>
</header>
${endpoints.map(card).join("\n")}
</main>
<script>${SCRIPT}</script>
</body>
</html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      Vary: "Accept",
    },
  });
}
