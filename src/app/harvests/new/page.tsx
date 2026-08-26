import { Page } from "@/components/ui";
import { HarvestForm } from "@/components/harvest-sale-forms";
import { loadLedger } from "@/lib/db/ledger";
import { openCycleOptions } from "@/lib/db/options";

export const dynamic = "force-dynamic";

export default async function NewHarvestPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { cycle } = await searchParams;
  const ledger = await loadLedger();

  return (
    <Page title="Log a harvest" subtitle="What came off the plot, by grade">
      <HarvestForm
        cycles={openCycleOptions(ledger)}
        products={ledger.products.map((p) => ({
          code: p.code, label: p.label, isGrade: p.isGrade,
        }))}
        defaultCycleId={cycle}
      />
    </Page>
  );
}
