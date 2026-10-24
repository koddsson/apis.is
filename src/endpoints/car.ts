import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

const TTL_SECONDS = 60 * 60;

const VEHICLE_SEARCH_QUERY = `query publicVehicleSearch($input: GetPublicVehicleSearchInput!) {
  publicVehicleSearch(input: $input) {
    permno
    regno
    vin
    make
    vehicleCommercialName
    color
    newRegDate
    firstRegDate
    vehicleStatus
    nextVehicleMainInspection
    co2
    weightedCo2
    co2WLTP
    weightedCo2WLTP
    massLaden
    mass
    co
    typeNumber
  }
}`;

async function fetchVehicle(number: string) {
  const serverResponse = await fetch("https://island.is/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "publicVehicleSearch",
      variables: { input: { search: number } },
      query: VEHICLE_SEARCH_QUERY,
    }),
  });
  const json = await serverResponse.json<{
    data: { publicVehicleSearch: Record<string, unknown> };
  }>();
  return json.data.publicVehicleSearch;
}

async function car(
  request: Request,
  params: Record<string, string>,
): Promise<Response> {
  const vehicle = await withCache(`car-${params.number}`, TTL_SECONDS, () =>
    fetchVehicle(params.number),
  );
  const res = response(
    vehicle,
    new URL(request.url).searchParams.get("pretty") === "true",
  );
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

car.meta = {
  endpoint: "/x/car/{number}",
  description:
    "Vehicle information lookup by registration number from island.is.",
};

car.health = {
  params: { number: "ISE92" },
  schema: z.looseObject({ permno: z.string() }),
};

export default car;
