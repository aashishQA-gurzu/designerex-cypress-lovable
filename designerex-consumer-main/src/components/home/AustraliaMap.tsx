import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";

const AUSTRALIA_TOPO_JSON = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const CITIES: { name: string; coords: [number, number] }[] = [
  { name: "Sydney", coords: [151.21, -33.87] },
  { name: "Melbourne", coords: [144.96, -37.81] },
  { name: "Brisbane", coords: [153.03, -27.47] },
  { name: "Perth", coords: [115.86, -31.95] },
  { name: "Adelaide", coords: [138.6, -34.93] },
  { name: "Gold Coast", coords: [153.43, -28.0] },
  { name: "Canberra", coords: [149.13, -35.28] },
  { name: "Hobart", coords: [147.33, -42.88] },
  { name: "Newcastle", coords: [151.78, -32.93] },
  { name: "Wollongong", coords: [150.89, -34.43] },
];

export function AustraliaMap() {
  return (
    <ComposableMap
      projection="geoMercator"
      projectionConfig={{ center: [134, -28], scale: 480 }}
      width={500}
      height={460}
      style={{ width: "100%", height: "auto" }}
    >
      <Geographies geography={AUSTRALIA_TOPO_JSON}>
        {({ geographies }) =>
          geographies
            .filter((geo) => geo.properties.name === "Australia")
            .map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="transparent"
                stroke="#9CA3AF"
                strokeWidth={1}
                style={{
                  default: { outline: "none" },
                  hover: { outline: "none" },
                  pressed: { outline: "none" },
                }}
              />
            ))
        }
      </Geographies>
      {CITIES.map(({ name, coords }) => (
        <Marker key={name} coordinates={coords}>
          <circle r={6} fill="var(--color-pink)" stroke="white" strokeWidth={2} />
        </Marker>
      ))}
    </ComposableMap>
  );
}
