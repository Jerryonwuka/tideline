"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef } from "react";

// Mapbox GL JS, loaded only on map screens (never on captain screens). Needs a public token
// (NEXT_PUBLIC_MAPBOX_TOKEN); without one the screens show positions as a list.

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  /** Departed vessels stand out. */
  active: boolean;
}

export const mapboxToken = () => process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export function MapboxView({
  markers,
  line,
  className,
}: {
  markers: MapMarker[];
  line?: [number, number][];
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<import("mapbox-gl").Map | null>(null);
  const markerObjs = useRef<import("mapbox-gl").Marker[]>([]);
  const lib = useRef<typeof import("mapbox-gl").default | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("mapbox-gl").then(({ default: mapboxgl }) => {
      if (cancelled || !container.current) return;
      lib.current = mapboxgl;
      mapboxgl.accessToken = mapboxToken();
      map.current = new mapboxgl.Map({
        container: container.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: markers[0] ? [markers[0].lng, markers[0].lat] : (line?.[0] ?? [0, 0]),
        zoom: 11,
      });
      map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }));
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // The map is created once; markers and the line update below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    const gl = lib.current;
    if (!m || !gl) return;
    markerObjs.current.forEach((mk) => mk.remove());
    markerObjs.current = markers.map((mk) =>
      new gl.Marker({ color: mk.active ? "#2bb3a3" : "#8a94a6" })
        .setLngLat([mk.lng, mk.lat])
        .setPopup(new gl.Popup({ offset: 16 }).setText(mk.label))
        .addTo(m),
    );
    const draw = () => {
      if (!line?.length) return;
      const data = {
        type: "Feature" as const,
        properties: {},
        geometry: { type: "LineString" as const, coordinates: line },
      };
      const source = m.getSource("track") as import("mapbox-gl").GeoJSONSource | undefined;
      if (source) source.setData(data);
      else {
        m.addSource("track", { type: "geojson", data });
        m.addLayer({ id: "track", type: "line", source: "track", paint: { "line-color": "#2bb3a3", "line-width": 3 } });
      }
      const bounds = line.reduce((b, c) => b.extend(c), new gl.LngLatBounds(line[0], line[0]));
      m.fitBounds(bounds, { padding: 40, maxZoom: 14 });
    };
    if (m.isStyleLoaded()) draw();
    else m.once("load", draw);
  }, [markers, line]);

  return <div ref={container} className={className ?? "h-96 w-full rounded-md border border-hairline"} />;
}
