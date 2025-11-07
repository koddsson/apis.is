import { response } from "../utils.ts";

interface Endpoint {
  endpoint: string;
  description: string;
}

export default async function meta(
  request: Request,
  _params: Record<string, string>,
): Promise<Response> {
  const endpoints: Endpoint[] = [
    {
      endpoint: "/x/gengi/{code}",
      description: "Currency exchange rates from Borgun. Optional {code} parameter to filter by currency code(s), comma-separated.",
    },
    {
      endpoint: "/x/meetups",
      description: "List of Icelandic tech meetups and community groups.",
    },
    {
      endpoint: "/x/car/{number}",
      description: "Vehicle information lookup by registration number from island.is.",
    },
  ];

  const data = {
    endpoints,
  };

  const url = new URL(request.url);
  return response(data, url.searchParams.get("pretty") === "true");
}
