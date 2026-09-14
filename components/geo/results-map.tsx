"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { formatDistance, formatMoney, formatRating } from "@/lib/format";
import type { Anchor, Row } from "@/components/results/types";

/**
 * Mapa dos resultados. Marcadores coloridos por score (ou por diária efetiva
 * quando não há score) e os raios das âncoras desenhados.
 */
export function ResultsMap({
  rows,
  anchors,
  onOpen,
}: {
  rows: Row[];
  anchors: Anchor[];
  onOpen: (row: Row) => void;
}) {
  const points = useMemo(
    () => rows.filter((row) => row.lat !== null && row.lng !== null),
    [rows],
  );

  const scale = useMemo(() => buildScale(points), [points]);

  const center = useMemo<[number, number]>(() => {
    if (anchors.length) return [anchors[0].lat, anchors[0].lng];
    if (points.length) return [points[0].lat!, points[0].lng!];
    return [38.7223, -9.1393];
  }, [anchors, points]);

  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return <div className="h-full w-full bg-muted" />;

  return (
    <MapContainer
      center={center}
      zoom={13}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FitToContent points={points} anchors={anchors} />

      {anchors.map((anchor) => (
        <Marker
          key={anchor.id}
          position={[anchor.lat, anchor.lng]}
          icon={anchorIcon()}
        >
          <Popup>
            <strong>{anchor.label}</strong>
            {anchor.maxDistanceM ? (
              <div>raio de {formatDistance(anchor.maxDistanceM).replace("~", "")}</div>
            ) : null}
          </Popup>
        </Marker>
      ))}

      {anchors
        .filter((anchor) => anchor.maxDistanceM)
        .map((anchor) => (
          <Circle
            key={`raio-${anchor.id}`}
            center={[anchor.lat, anchor.lng]}
            radius={anchor.maxDistanceM!}
            pathOptions={{ color: "#7c5c3a", weight: 1, fillOpacity: 0.05 }}
          />
        ))}

      {points.map((row) => (
        <CircleMarker
          key={row.externalId}
          center={[row.lat!, row.lng!]}
          radius={6}
          pathOptions={{
            color: scale(row),
            fillColor: scale(row),
            fillOpacity: 0.75,
            weight: 1,
          }}
          eventHandlers={{ click: () => onOpen(row) }}
        >
          <Popup>
            <div className="space-y-0.5 text-xs">
              <strong>{row.title ?? row.externalId}</strong>
              <div>
                {formatMoney(row.effectiveNightly, row.currency)} /noite real
              </div>
              {row.ratingOverall !== null ? (
                <div>
                  {formatRating(row.ratingOverall)} · {row.reviewCount} avaliações
                </div>
              ) : null}
              <div className="text-muted-foreground">
                Posição aproximada (±150 m)
              </div>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

/**
 * Cor por score quando há score; por diária efetiva quando não há. Em ambos
 * os casos verde = melhor, vermelho = pior, dentro do conjunto atual.
 */
function buildScale(rows: Row[]): (row: Row) => string {
  const hasScore = rows.some((row) => row.score !== undefined);

  const values = rows
    .map((row) => (hasScore ? row.score : row.effectiveNightly))
    .filter((value): value is number => value !== null && value !== undefined);

  if (values.length === 0) return () => "#7c5c3a";

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  return (row) => {
    const raw = hasScore ? row.score : row.effectiveNightly;
    if (raw === null || raw === undefined) return "#9ca3af";
    const normalized = (raw - min) / span;
    // Sem score, menor preço é melhor: a escala inverte.
    const goodness = hasScore ? normalized : 1 - normalized;
    const hue = Math.round(goodness * 120); // 0 = vermelho, 120 = verde
    return `hsl(${hue} 65% 42%)`;
  };
}

function FitToContent({
  points,
  anchors,
}: {
  points: Row[];
  anchors: Anchor[];
}) {
  const map = useMap();

  useEffect(() => {
    const coordinates: [number, number][] = [
      ...points.map((row) => [row.lat!, row.lng!] as [number, number]),
      ...anchors.map((anchor) => [anchor.lat, anchor.lng] as [number, number]),
    ];
    if (coordinates.length === 0) return;
    map.fitBounds(L.latLngBounds(coordinates), { padding: [32, 32], maxZoom: 15 });
  }, [map, points, anchors]);

  return null;
}

function anchorIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:12px;height:12px;border-radius:9999px;background:#7c5c3a;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,.25)"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}
