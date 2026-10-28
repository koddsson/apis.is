export function capitalizeFirstLetter(val: string) {
  return String(val).charAt(0).toUpperCase() + String(val).slice(1);
}

export function response(
  data: unknown[] | Record<string, unknown> | null,
  pretty = false,
  status = 200,
) {
  return new Response(JSON.stringify(data, null, pretty ? 2 : 0), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
