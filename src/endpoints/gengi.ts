import { XMLParser } from "fast-xml-parser";
import { capitalizeFirstLetter } from "../utils.ts";

// TODO: Implement caching

interface Currency {
  description?: string;
  rate: number;
}

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

async function gengi(
  _request: Request,
  params: Record<string, string>,
): Promise<Response> {
  const response = await fetch(
    "https://www.borgun.is/currency/Default.aspx?function=all",
  );
  const text = await response.text();
  const json = parser.parse(text) as BorgunRates;
  const currencies: Record<string, Currency> = {};
  for (const rate of json.Rates.Rate) {
    const code = rate.CurrencyCode;
    const description = rate.CurrencyDescription?.split(",")
      ?.reverse()
      ?.join(" ")
      .trim();
    currencies[code] = {
      rate: parseFloat(rate.CurrencyRate),
    };
    if (description) {
      currencies[code].description = capitalizeFirstLetter(description);
    }
  }

  let data = currencies;

  if (params.code) {
    const codes = params.code.split(",");
    const filteredCodes = Object.entries(currencies).filter(([code]) =>
      codes.includes(code),
    );
    data = Object.fromEntries(filteredCodes);
  }

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  });
}

gengi.meta = {
  endpoint: "/x/gengi/{code}",
  description:
    "Currency exchange rates from Borgun. Optional {code} parameter to filter by currency code(s), comma-separated.",
};

export default gengi;
