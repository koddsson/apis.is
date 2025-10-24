import { xml2js } from "https://deno.land/x/xml2js@1.0.0/mod.ts";
import { capitalizeFirstLetter } from "../utils.ts";

// TODO: Implement caching

interface Currency {
  description: string;
  rate: number;
}

export default async function gengi(
  _request,
  params,
): Promise<Response> {
  const response = await fetch(
    "https://www.borgun.is/currency/Default.aspx?function=all",
  );
  const text = await response.text();
  const json = xml2js(text, { compact: true });
  const currencies: Record<string, Currency> = {};
  for (const rate of json["Rates"]["Rate"]) {
    const code = rate["CurrencyCode"]["_text"];
    const description = rate["CurrencyDescription"]?.["_text"]?.split(',')?.reverse()?.join(' ').trim();
    currencies[code] = {
      rate: parseFloat(rate["CurrencyRate"]["_text"]),
    };
    if (description) {
      currencies[code].description = capitalizeFirstLetter(description);
    }
  }

  let data = currencies

  if (params.code) {
    const codes = params.code.split(",");
    const filteredCodes = Object.entries(currencies).filter(([code, currency]) => codes.includes(code));
    data = Object.fromEntries(filteredCodes);
  }

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  });
}
