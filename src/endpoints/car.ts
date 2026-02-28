import { response } from "../utils.ts";
// TODO: Implement caching

const VEHICLE_SEARCH_QUERY =
  `query publicVehicleSearch($input: GetPublicVehicleSearchInput!) {
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

/**
 * Pretty bog standard fetching the data from a existing endpoint and returining whatever it gives us.
 */
async function car(
  request: Request,
  params: Record<string, string>,
): Promise<Response> {
  const serverResponse = await fetch("https://island.is/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "publicVehicleSearch",
      variables: { input: { search: params.number } },
      query: VEHICLE_SEARCH_QUERY,
    }),
  });
  const json = await serverResponse.json();
  const url = new URL(request.url);
  return response(
    json.data.publicVehicleSearch,
    url.searchParams.get("pretty") === "true",
  );
}

car.meta = {
  endpoint: "/x/car/{number}",
  description:
    "Vehicle information lookup by registration number from island.is.",
};

export default car;
