import { VehicleHistoryView } from "@/components/vehicles/vehicle-history-view";

export const dynamic = "force-dynamic";

export default async function VehiclePage({
  params,
}: {
  params: Promise<{ vehicleNo: string }>;
}) {
  const { vehicleNo } = await params;
  const plate = decodeURIComponent(vehicleNo).trim().toUpperCase();
  return <VehicleHistoryView vehicleNo={plate} />;
}
