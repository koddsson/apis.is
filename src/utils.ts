export function capitalizeFirstLetter(val: string) {
  return String(val).charAt(0).toUpperCase() + String(val).slice(1);
}

export function response(
  data: unknown[] | Record<string, unknown>,
  pretty = false,
) {
  return new Response(JSON.stringify(data, null, pretty ? 2 : 0), {
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  });
}
