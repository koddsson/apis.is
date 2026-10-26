import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

const SOURCE_URL =
  "https://gagnaveita.vegagerdin.is/geoserver/gis/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gis:roadconditions_pointincident&outputFormat=application/json&srsName=EPSG:4326";
const TTL_SECONDS = 5 * 60;

const TYPES: Record<string, string> = {
  VEGAVINNA: "roadworks",
  ALLUR_AKSTUR_BANN: "closed",
  TONN_ALLS: "axleWeightLimit",
  HOLUR_I_VEGI: "potholes",
  OSLETTUR_VEGUR: "unevenRoad",
  GRJOTHRUN: "rockfall",
};

const Incident = z.object({
  type: z.string(),
  description: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  start: z.iso.datetime(),
  end: z.iso.datetime().nullable(),
});
type Incident = z.infer<typeof Incident>;

interface UpstreamFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    ASTAND: string;
    DESCRIPTION: string;
    STARTTIME: string;
    STOPTIME: string | null;
  };
}

async function fetchIncidents(): Promise<Incident[]> {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Failed to fetch road incidents: ${res.status}`);
  const { features } = await res.json<{ features?: UpstreamFeature[] }>();
  if (!Array.isArray(features)) {
    throw new Error("Unexpected road incidents response");
  }

  return features.map(({ geometry, properties: incident }) => {
    const [longitude, latitude] = geometry.coordinates;
    return {
      type: TYPES[incident.ASTAND] ?? incident.ASTAND.toLowerCase(),
      description: incident.DESCRIPTION,
      latitude,
      longitude,
      start: incident.STARTTIME,
      end: incident.STOPTIME,
    };
  });
}

async function roadIncidents(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const types = Object.values(TYPES);
  if (type && !types.includes(type)) {
    return response(
      { error: `Unknown type ${type}, expected one of: ${types.join(", ")}` },
      false,
      400,
    );
  }

  const incidents = await withCache(
    "road-incidents",
    TTL_SECONDS,
    fetchIncidents,
  );
  const data = type
    ? incidents.filter((incident) => incident.type === type)
    : incidents;

  const res = response(data, url.searchParams.get("pretty") === "true");
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

roadIncidents.meta = {
  endpoint: "/x/roads/incidents",
  description:
    "Current road incidents from Vegagerðin: roadworks, closures, axle weight limits, potholes, uneven road and rockfall warnings, with location and start/end times. Optional ?type= filter (roadworks, closed, axleWeightLimit, potholes, unevenRoad, rockfall).",
};

roadIncidents.health = { schema: z.array(Incident) };

export default roadIncidents;
