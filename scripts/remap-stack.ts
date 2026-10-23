import { type RawSourceMap, SourceMapConsumer } from "source-map-js";

const BUNDLE_FRAME = /\bindex\.js:(\d+):(\d+)/g;
const STACK_BLOCK = /\*\*Stack Trace:\*\*\n```\n([\s\S]*?)\n```/;

// Map sources are relative to wrangler's outdir and embed the CI checkout path.
export function repoRelativePath(source: string): string {
  const nodeModules = source.indexOf("/node_modules/");
  if (nodeModules !== -1) return source.slice(nodeModules + 1);
  const src = source.lastIndexOf("/src/");
  if (src !== -1) return source.slice(src + 1);
  return source.replace(/^(\.\.\/)+/, "");
}

export function remapStack(stack: string, rawMap: RawSourceMap): string {
  const consumer = new SourceMapConsumer(rawMap);
  return stack.replace(BUNDLE_FRAME, (frame, line, column) => {
    const original = consumer.originalPositionFor({
      line: Number(line),
      column: Number(column) - 1,
    });
    if (!original.source || original.line === null) return frame;
    return `${repoRelativePath(original.source)}:${original.line}:${original.column + 1}`;
  });
}

export function remapIssueBody(
  body: string,
  rawMap: RawSourceMap,
  commit: string,
): string | null {
  const match = STACK_BLOCK.exec(body);
  if (!match) return null;

  const bundled = match[1];
  const remapped = remapStack(bundled, rawMap);
  if (remapped === bundled) return null;

  const replacement = `**Stack Trace** (source-mapped to \`${commit.slice(0, 7)}\`):
\`\`\`
${remapped}
\`\`\`

<details>
<summary>Bundled stack trace</summary>

\`\`\`
${bundled}
\`\`\`

</details>`;
  return body.replace(match[0], () => replacement);
}
