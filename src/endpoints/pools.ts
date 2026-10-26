import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

// An R Shiny dashboard; the data only comes over its SockJS websocket.
const SOURCE_URL = "https://gestafjoldi.reykjavik.is";
const TTL_SECONDS = 5 * 60;
const TIMEOUT_MS = 20_000;

const Reading = z.object({
  time: z.iso.datetime(),
  count: z.number(),
});

const Pool = z.object({
  name: z.string(),
  capacity: z.number(),
  count: z.number().nullable(),
  time: z.iso.datetime().nullable(),
  today: z.array(Reading),
});
type Pool = z.infer<typeof Pool>;

interface Trace {
  name?: string;
  x: number[];
  y: number[];
  hovertext?: string[];
}

interface Plot {
  data: Trace[];
}

interface ShinyMessage {
  errors?: Record<string, unknown>;
  values?: { plotly?: { x: Plot } };
}

function shinyMessages(frame: string): ShinyMessage[] {
  if (!frame.startsWith("a")) return [];
  return (JSON.parse(frame.slice(1)) as string[])
    .map((message) => /^[0-9A-F]+#0\|m\|(.*)$/s.exec(message)?.[1])
    .filter((message) => message !== undefined)
    .map((message) => JSON.parse(message));
}

async function connect(): Promise<WebSocket> {
  const page = await fetch(`${SOURCE_URL}/`);
  if (!page.ok)
    throw new Error(`Failed to fetch pool dashboard: ${page.status}`);
  const cookie = page.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const worker = /base href="_w_([0-9a-f]+)\//.exec(await page.text());
  if (!worker) throw new Error("Pool dashboard worker not found on page");

  const token = await fetch(`${SOURCE_URL}/__token__`, { headers: { cookie } });
  if (!token.ok) throw new Error(`Failed to fetch pool token: ${token.status}`);

  const socket = await fetch(
    `${SOURCE_URL}/__sockjs__/n=apisis/t=${await token.text()}/w=${worker[1]}/s=0/0/apisisis/websocket`,
    { headers: { Upgrade: "websocket", cookie } },
  );
  if (!socket.webSocket) {
    throw new Error(`Failed to open pool dashboard socket: ${socket.status}`);
  }
  socket.webSocket.accept();
  return socket.webSocket;
}

// The dashboard's "Núna" view has each pool's capacity, "Í dag" today's counts.
function fetchPlots(ws: WebSocket): Promise<[Plot, Plot]> {
  return new Promise((resolve, reject) => {
    const plots: Plot[] = [];
    const fail = (error: Error) => {
      clearTimeout(timer);
      ws.close();
      reject(error);
    };
    const timer = setTimeout(
      () => fail(new Error("Timed out waiting for pool dashboard")),
      TIMEOUT_MS,
    );
    const send = (id: number, method: string, data: unknown) =>
      ws.send(
        JSON.stringify([`${id}#0|m|${JSON.stringify({ method, data })}`]),
      );

    ws.addEventListener("message", ({ data }) => {
      if (data === "o") {
        ws.send(JSON.stringify(["0#0|o|"]));
        send(1, "init", {
          radio: "Núna",
          ".clientdata_output_plotly_width": 800,
          ".clientdata_output_plotly_height": 400,
          ".clientdata_output_plotly_hidden": false,
        });
        return;
      }
      for (const message of shinyMessages(String(data))) {
        if (message.errors && Object.keys(message.errors).length > 0) {
          fail(
            new Error(
              `Pool dashboard error: ${JSON.stringify(message.errors)}`,
            ),
          );
          return;
        }
        const plot = message.values?.plotly?.x;
        if (!plot) continue;
        plots.push(plot);
        if (plots.length === 1) {
          send(2, "update", { radio: "Í dag" });
        } else {
          clearTimeout(timer);
          ws.close();
          resolve([plots[0], plots[1]]);
        }
      }
    });
    ws.addEventListener("close", () =>
      fail(new Error("Pool dashboard closed the connection")),
    );
  });
}

export function parsePools(now: Plot, today: Plot): Pool[] {
  const capacities = new Map<string, number>();
  for (const trace of now.data) {
    for (const hover of trace.hovertext ?? []) {
      const match = /Sundlaug: (.+?)<br \/>.*cap: (\d+)/s.exec(hover);
      if (match) capacities.set(match[1], Number(match[2]));
    }
  }
  if (capacities.size === 0) throw new Error("Pool capacities not found");

  const series = new Map(
    today.data.flatMap((trace) => (trace.name ? [[trace.name, trace]] : [])),
  );
  return [...capacities]
    .sort(([a], [b]) => a.localeCompare(b, "is"))
    .map(([name, capacity]) => {
      const trace = series.get(name) ?? { x: [], y: [] };
      const readings = trace.x.map((x, index) => ({
        time: new Date(x * 1000).toISOString(),
        count: trace.y[index],
      }));
      const latest = readings.at(-1);
      return {
        name,
        capacity,
        count: latest?.count ?? null,
        time: latest?.time ?? null,
        today: readings,
      };
    });
}

async function fetchPools(): Promise<Pool[]> {
  const [now, today] = await fetchPlots(await connect());
  return parsePools(now, today);
}

async function pools(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const all = await withCache("pools", TTL_SECONDS, fetchPools);

  const name = url.searchParams.get("pool");
  const data = name
    ? all.filter((pool) => pool.name.toLowerCase() === name.toLowerCase())
    : all;
  if (name && data.length === 0) {
    return response({ error: `Unknown pool ${name}` }, false, 404);
  }

  const res = response(data, url.searchParams.get("pretty") === "true");
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

pools.meta = {
  endpoint: "/x/pools",
  description:
    "Estimated number of people in each of Reykjavík's city swimming pools, with capacity, the latest count and today's counts in 5-minute steps. Optional ?pool= name filter, e.g. Vesturbæjarlaug.",
};

pools.health = { schema: z.array(Pool).min(1) };

export default pools;
