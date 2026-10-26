import * as z from "zod";
import { cacheControl, withCache } from "../cache.ts";
import { response } from "../utils.ts";

// Vegagerðin's wave buoys, as a WFS layer reprojected to WGS84.
const SOURCE_URL =
  "https://gagnaveita.vegagerdin.is/geoserver/gis/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gis:fa_dufl&outputFormat=application/json&srsName=EPSG:4326";
const TTL_SECONDS = 10 * 60;

const Buoy = z.object({
  id: z.number(),
  name: z.string(),
  location: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  depth: z.number().nullable(),
  time: z.iso.datetime(),
  waveHeight: z.number().nullable(),
  period: z.number().nullable(),
  wavelength: z.number().nullable(),
  direction: z.number().nullable(),
  seaTemperature: z.number().nullable(),
});
type Buoy = z.infer<typeof Buoy>;

interface UpstreamFeature {
  // The LON property has no minus sign, so take coordinates from here.
  geometry: { coordinates: [number, number] };
  properties: {
    IDDUFL: number;
    NAFN: string;
    SKYRING: string | null;
    DYPI: number | null;
    MA_BIRTA: number;
    DAGS: string;
    KENNIALDA: number | null;
    SVEIFLUTIMI: number | null;
    OLDULENGD: number | null;
    OLDUATT: number | null;
    SJAVARHITI: number | null;
  };
}

async function fetchBuoys(): Promise<Buoy[]> {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Failed to fetch wave buoys: ${res.status}`);
  const { features } = await res.json<{ features: UpstreamFeature[] }>();

  return features
    .filter(({ properties }) => properties.MA_BIRTA === 1)
    .map(({ geometry, properties: buoy }) => {
      const [longitude, latitude] = geometry.coordinates;
      return {
        id: buoy.IDDUFL,
        name: buoy.NAFN,
        location: buoy.SKYRING,
        latitude,
        longitude,
        depth: buoy.DYPI,
        time: buoy.DAGS,
        waveHeight: buoy.KENNIALDA,
        period: buoy.SVEIFLUTIMI,
        wavelength: buoy.OLDULENGD,
        direction: buoy.OLDUATT,
        seaTemperature: buoy.SJAVARHITI,
      };
    });
}

async function waves(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const buoys = await withCache("waves", TTL_SECONDS, fetchBuoys);

  const id = url.searchParams.get("buoy");
  const data = id ? buoys.filter((buoy) => String(buoy.id) === id) : buoys;
  if (id && data.length === 0) {
    return response({ error: `Unknown buoy ${id}` }, false, 404);
  }

  const res = response(data, url.searchParams.get("pretty") === "true");
  res.headers.set("Cache-Control", cacheControl(TTL_SECONDS));
  return res;
}

waves.meta = {
  endpoint: "/x/waves",
  description:
    "Latest readings from Vegagerðin's wave buoys around Iceland: significant wave height (m), period (s), wavelength (m), direction and sea temperature where measured. Optional ?buoy= id filter.",
};

waves.health = { schema: z.array(Buoy).min(1) };

export default waves;
