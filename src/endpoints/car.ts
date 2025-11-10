import { response } from '../utils.ts';
// TODO: Implement caching

/**
 * Pretty bog standard fetching the data from a existing endpoint and returining whatever it gives us.
 */
async function car(
  request: Request,
  params: Record<string, string>,
): Promise<Response> {
  const serverResponse = await fetch(
    `https://island.is/api/graphql?operationName=GetPublicVehicleSearch&variables=%7B%22input%22%3A%7B%22search%22%3A%22${params.number}%22%7D%7D&extensions=%7B%22persistedQuery%22%3A%7B%22version%22%3A1%2C%22sha256Hash%22%3A%22b04f6f91c746425e2b15966df336f47814b94a0642bfbf6fa3ad7bdd8d3c80e5%22%7D%7D`,
  );
  const json = await serverResponse.json();
  const url = new URL(request.url);
  return response(json.data.getPublicVehicleSearch, url.searchParams.get("pretty") === "true")
}

car.meta = {
  endpoint: "/x/car/{number}",
  description: "Vehicle information lookup by registration number from island.is.",
};

export default car;
