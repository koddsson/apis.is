import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

// Stored in ISN93, so ask GeoServer to reproject to WGS84.
const SOURCE_URL =
  "https://gagnaveita.vegagerdin.is/geoserver/gis/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gis:vefmyndavel_2024_1&outputFormat=application/json&srsName=EPSG:4326";
const TTL_SECONDS = 60 * 60;

const Camera = z.object({
  id: z.number(),
  name: z.string(),
  road: z.string().nullable(),
  roadName: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  images: z
    .array(z.object({ description: z.string().nullable(), url: z.url() }))
    .min(1),
});
type Camera = z.infer<typeof Camera>;

interface UpstreamFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    MAELIST_NR: number;
    MYNDAVEL: string;
    VEGNR: string | null;
    VEGHEITI: string | null;
    SKYRING: string | null;
    SLOD: string;
    ROD: number;
  };
}

async function fetchCameras(): Promise<Camera[]> {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Failed to fetch road cameras: ${res.status}`);
  const { features } = await res.json<{ features?: UpstreamFeature[] }>();
  if (!Array.isArray(features)) {
    throw new Error("Unexpected road cameras response");
  }

  const cameras = new Map<number, Camera>();
  const sorted = features.toSorted(
    (a, b) => a.properties.ROD - b.properties.ROD,
  );
  for (const { geometry, properties: image } of sorted) {
    let camera = cameras.get(image.MAELIST_NR);
    if (!camera) {
      const [longitude, latitude] = geometry.coordinates;
      camera = {
        id: image.MAELIST_NR,
        name: image.MYNDAVEL,
        road: image.VEGNR,
        roadName: image.VEGHEITI,
        latitude,
        longitude,
        images: [],
      };
      cameras.set(image.MAELIST_NR, camera);
    }
    camera.images.push({ description: image.SKYRING, url: image.SLOD });
  }

  return [...cameras.values()].sort((a, b) => a.id - b.id);
}

async function roadCameras(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const cameras = await withCache("road-cameras", TTL_SECONDS, fetchCameras);

  const road = url.searchParams.get("road");
  const data = road
    ? cameras.filter((camera) =>
        camera.road?.toUpperCase().split("/").includes(road.toUpperCase()),
      )
    : cameras;
  if (road && data.length === 0) {
    return response({ error: `No cameras on road ${road}` }, false, 404);
  }

  const res = response(data, url.searchParams.get("pretty") === "true");
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

roadCameras.meta = {
  endpoint: "/x/roads/cameras",
  description:
    "Vegagerðin's road webcams with location, road and links to their latest images. Optional ?road= road number filter, e.g. 1 or 41; cameras at junctions list both roads, like 49/41.",
};

roadCameras.health = { schema: z.array(Camera).min(1) };

export default roadCameras;
