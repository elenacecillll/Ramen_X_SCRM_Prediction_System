import { loadDataset } from "@/lib/hor/parse";
import HorClient from "./hor-client";

// Read the workbook from disk on each request rather than baking it in at build time,
// so swapping the Excel file is reflected without rebuilding.
export const dynamic = "force-dynamic";

// Server Component: parse the Excel workbook on the server, then hand the plain input
// data to the client component which performs all (re)calculation reactively.
export default function Home() {
  const dataset = loadDataset();
  return (
    <main className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] dark:bg-black dark:text-[#f5f5f7]">
      <HorClient dataset={dataset} />
    </main>
  );
}
