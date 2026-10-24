import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

const Offer = z.object({
  name: z.string(),
  description: z.string(),
  image: z.string(),
  address: z.string(),
  days: z.array(z.string()),
  link: z.string(),
});
type Offer = z.infer<typeof Offer>;

interface UpstreamOffer {
  name: string;
  handle: string;
  description: string | null;
  imageUrl: string | null;
  days: boolean[];
  locations: Array<{ streetAddress: string | null }>;
}

const DAY_NAMES = ["Mán", "Þri", "Mið", "Fim", "Fös", "Lau", "Sun"];
const BASE_URL = "https://www.nova.is";
const TTL_SECONDS = 60 * 60;

// The GraphQL API behind nova.is's own frontend; not a documented API.
const GRAPHQL_URL = "https://graphql.nova.is/graphql";
const QUERY = `query twoForOne($input: TwoForOneInput) {
  twoForOne(input: $input) {
    twoForOne {
      name
      handle
      description
      imageUrl
      days
      locations {
        streetAddress
      }
    }
  }
}`;

function toOffer(offer: UpstreamOffer): Offer {
  return {
    name: offer.name,
    description: offer.description ?? "",
    image: offer.imageUrl ?? "",
    address:
      offer.locations.find((location) => location.streetAddress)
        ?.streetAddress ?? "",
    // Upstream days start on Sunday; DAY_NAMES starts on Monday.
    days: DAY_NAMES.filter((_, i) => offer.days[(i + 1) % 7]),
    link: `${BASE_URL}/dansgolfid/fyrir-thig/2f1/${offer.handle}`,
  };
}

async function fetchOffers(): Promise<Offer[]> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: QUERY,
      variables: { input: { filter: {}, pageSize: 200 } },
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch offers: ${res.status}`);
  }

  const json = await res.json<{
    data?: { twoForOne: { twoForOne: UpstreamOffer[] } };
    errors?: Array<{ message: string }>;
  }>();
  if (!json.data) {
    throw new Error(
      `Nova GraphQL error: ${json.errors?.map((e) => e.message).join("; ")}`,
    );
  }

  return json.data.twoForOne.twoForOne.map(toOffer);
}

async function nova2f1(request: Request): Promise<Response> {
  const offers = await withCache("nova-2f1", TTL_SECONDS, fetchOffers);
  const res = response(
    offers,
    new URL(request.url).searchParams.get("pretty") === "true",
  );
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

nova2f1.meta = {
  endpoint: "/x/nova-2f1",
  description: "2-for-1 offers from Nova's FyrirÞig program.",
};

nova2f1.health = { schema: z.array(Offer).min(1) };

export default nova2f1;
