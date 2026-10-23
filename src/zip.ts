// Reads individual files from a remote zip with HTTP range requests, so a
// large archive can be used without downloading all of it.

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
// The end record is 22 bytes plus a comment of up to 65535 bytes.
const TAIL_BYTES = 22 + 0xffff;

interface Entry {
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

async function fetchRange(url: string, range: string): Promise<DataView> {
  const res = await fetch(url, { headers: { Range: `bytes=${range}` } });
  if (res.status !== 206) {
    throw new Error(`Range request to ${url} failed: ${res.status}`);
  }
  return new DataView(await res.arrayBuffer());
}

function findEndRecord(tail: DataView): number {
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === END_OF_CENTRAL_DIRECTORY) return i;
  }
  throw new Error("Not a zip file: end of central directory not found");
}

async function readDirectory(url: string): Promise<Map<string, Entry>> {
  const tail = await fetchRange(url, `-${TAIL_BYTES}`);
  const end = findEndRecord(tail);
  const size = tail.getUint32(end + 12, true);
  const offset = tail.getUint32(end + 16, true);
  const directory = await fetchRange(url, `${offset}-${offset + size - 1}`);

  const decoder = new TextDecoder();
  const entries = new Map<string, Entry>();
  let i = 0;
  while (
    i < directory.byteLength &&
    directory.getUint32(i, true) === CENTRAL_DIRECTORY_ENTRY
  ) {
    const nameLength = directory.getUint16(i + 28, true);
    const extraLength = directory.getUint16(i + 30, true);
    const commentLength = directory.getUint16(i + 32, true);
    const name = decoder.decode(
      new Uint8Array(
        directory.buffer,
        directory.byteOffset + i + 46,
        nameLength,
      ),
    );
    entries.set(name, {
      method: directory.getUint16(i + 10, true),
      compressedSize: directory.getUint32(i + 20, true),
      localHeaderOffset: directory.getUint32(i + 42, true),
    });
    i += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function readEntry(url: string, entry: Entry): Promise<string> {
  const header = await fetchRange(
    url,
    `${entry.localHeaderOffset}-${entry.localHeaderOffset + 29}`,
  );
  const dataStart =
    entry.localHeaderOffset +
    30 +
    header.getUint16(26, true) +
    header.getUint16(28, true);
  const data = await fetchRange(
    url,
    `${dataStart}-${dataStart + entry.compressedSize - 1}`,
  );

  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) {
    throw new Error(`Unsupported zip compression method ${entry.method}`);
  }
  const inflated = new Response(
    new Blob([data])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw")),
  );
  return inflated.text();
}

export async function readZipFiles(
  url: string,
  names: string[],
): Promise<Record<string, string>> {
  const entries = await readDirectory(url);
  const files: Record<string, string> = {};
  for (const name of names) {
    const entry = entries.get(name);
    if (!entry) throw new Error(`${name} not found in ${url}`);
    files[name] = await readEntry(url, entry);
  }
  return files;
}
