import type { Parking } from "@/lib/parkings.schema";
import { useParkingLabels } from "./use-labels";

// A garage's translated type ("Indoor garage") or low-emission-zone status
// ("Inside LEZ"), for places that can't call the hook themselves (async
// server components).
export function ParkingLabel({
  parking,
  kind,
}: {
  parking: Parking;
  kind: "type" | "lez";
}) {
  const labels = useParkingLabels();
  return <>{kind === "type" ? labels.type(parking) : labels.lez(parking)}</>;
}
