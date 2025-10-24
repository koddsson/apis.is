import { xml2js } from "https://deno.land/x/xml2js@1.0.0/mod.ts";

interface Currency {
  name: string;
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
    currencies[code] = {
      name: rate["Country"]["_text"],
      rate: parseFloat(rate["CurrencyRate"]["_text"]),
    };
  }

  if (params.code) {
    return new Response(JSON.stringify(currencies[params.code], null, 2));
  }
  return new Response(JSON.stringify(currencies, null, 2));
}
