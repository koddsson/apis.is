// A small GTFS-like zip: deflated stops.txt and routes.txt, a stored
// agency.txt, and a bzip2 legacy.txt (unsupported compression).
const FIXTURE_BASE64 =
  "UEsDBBQAAAAIAAAAIQBXJjNJcwAAAJQAAAAJAAAAc3RvcHMudHh0Ky7JL4jPTNEpBtHJ+SmpEFZeYi6UlZJanAxh5SSWQBn5ebxchgZAYGFgoqOjFFyal1eakXN47eENSjo6ZiZ6hgaWBhZGOrpGhnqWBpamlma8XJYg5UaWpkDlHjmpubmlRToKSkrOSkpQHSbGEOWGprxcAFBLAwQUAAAACAAAACEAxRJvJocAAACyAAAACgAAAHJvdXRlcy50eHQryi8tSY3PTNFJTE/NS64EsYrAQsUZ+UUl8XmJualQgZz8vHRkfkpqcTKUWVJZABMtLcqBspLzc/KLeLkMdUBQKTj78K6cxPTEkkQFG107BY+0LD2F4OzEosMbijNyDq89vEFJR8dYR0cpxdjIzMBAiZfL1ByoDUgoOWaXFqVWFmVCFPByAQBQSwMEFAAAAAAAAAAhAKS3STwhAAAAIQAAAAoAAABhZ2VuY3kudHh0YWdlbmN5X2lkLGFnZW5jeV9uYW1lCjEsU3Ryw6Z0w7MKUEsDBC4AAAAMAAAAIQDl1F0/JgAAAAMAAAAKAAAAbGVnYWN5LnR4dEJaaDkxQVkmU1kfQ5ioAAABAQAEBKAAIZgZgWF3JFOFCQH0OYqAUEsBAhQDFAAAAAgAAAAhAFcmM0lzAAAAlAAAAAkAAAAAAAAAAAAAAIABAAAAAHN0b3BzLnR4dFBLAQIUAxQAAAAIAAAAIQDFEm8mhwAAALIAAAAKAAAAAAAAAAAAAACAAZoAAAByb3V0ZXMudHh0UEsBAhQDFAAAAAAAAAAhAKS3STwhAAAAIQAAAAoAAAAAAAAAAAAAAIABSQEAAGFnZW5jeS50eHRQSwECLgMuAAAADAAAACEA5dRdPyYAAAADAAAACgAAAAAAAAAAAAAAgAGSAQAAbGVnYWN5LnR4dFBLBQYAAAAABAAEAN8AAADgAQAAAAA=";

export const GTFS_ZIP = Uint8Array.from(atob(FIXTURE_BASE64), (char) =>
  char.charCodeAt(0),
);

// Mocks fetch to serve `bytes` with HTTP range support, like a static file host.
export function serveZip(bytes: Uint8Array) {
  const originalFetch = globalThis.fetch;
  const ranges: string[] = [];
  globalThis.fetch = (_input: string | URL | Request, init?: RequestInit) => {
    const range = new Headers(init?.headers).get("Range") ?? "";
    ranges.push(range);
    const suffix = /^bytes=-(\d+)$/.exec(range);
    const span = /^bytes=(\d+)-(\d+)$/.exec(range);
    const [start, end] = suffix
      ? [Math.max(0, bytes.length - Number(suffix[1])), bytes.length - 1]
      : span
        ? [Number(span[1]), Number(span[2])]
        : [0, bytes.length - 1];
    return Promise.resolve(
      new Response(bytes.slice(start, end + 1), {
        status: suffix || span ? 206 : 200,
      }),
    );
  };
  return { ranges, restore: () => (globalThis.fetch = originalFetch) };
}
