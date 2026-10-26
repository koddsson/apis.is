import { XMLParser } from "fast-xml-parser";
import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { capitalizeFirstLetter, response } from "../utils.ts";

const TTL_SECONDS = 15 * 60;

const Currency = z.object({
  description: z.string().optional(),
  rate: z.number(),
});
type Currency = z.infer<typeof Currency>;

interface BorgunRates {
  Rates: {
    Rate: Array<{
      CurrencyCode: string;
      CurrencyDescription?: string;
      CurrencyRate: string;
    }>;
  };
}

const parser = new XMLParser({
  parseTagValue: false,
  isArray: (name) => name === "Rate",
});

async function fetchCurrencies(): Promise<Record<string, Currency>> {
  const response = await fetch(
    "https://www.borgun.is/currency/Default.aspx?function=all",
  );
  const text = await response.text();
  const json = parser.parse(text) as BorgunRates;
  const currencies: Record<string, Currency> = {};
  for (const rate of json.Rates.Rate) {
    const code = rate.CurrencyCode;
    const description = rate.CurrencyDescription?.split(",")
      .reverse()
      .join(" ")
      .trim();
    currencies[code] = {
      rate: parseFloat(rate.CurrencyRate),
    };
    if (description) {
      currencies[code].description = capitalizeFirstLetter(description);
    }
  }
  return currencies;
}

async function gengi(
  request: Request,
  params: Record<string, string>,
): Promise<Response> {
  const currencies = await withCache("gengi", TTL_SECONDS, fetchCurrencies);

  let data = currencies;

  if (params.code) {
    const codes = params.code.split(",");
    const filteredCodes = Object.entries(currencies).filter(([code]) =>
      codes.includes(code),
    );
    data = Object.fromEntries(filteredCodes);
  }

  const res = response(
    data,
    new URL(request.url).searchParams.get("pretty") === "true",
  );
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

gengi.meta = {
  endpoint: "/x/gengi/{code}",
  description:
    "Currency exchange rates from Borgun. Optional {code} parameter to filter by currency code(s), comma-separated.",
};

gengi.health = {
  params: { code: "USD" },
  schema: z.object({ USD: Currency.extend({ rate: z.number().positive() }) }),
};

export default gengi;
