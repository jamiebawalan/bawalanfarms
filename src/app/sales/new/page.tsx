import { Page } from "@/components/ui";
import { SaleForm } from "@/components/harvest-sale-forms";
import { loadLedger } from "@/lib/db/ledger";
import { lastPriceBook, openCycleOptions } from "@/lib/db/options";

export const dynamic = "force-dynamic";

export default async function NewSalePage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { cycle } = await searchParams;
  const ledger = await loadLedger();

  return (
    <Page title="Log a sale" subtitle="Price is per line, every time">
      <SaleForm
        cycles={openCycleOptions(ledger)}
        products={ledger.products.map((p) => ({
          code: p.code, label: p.label, isGrade: p.isGrade,
        }))}
        buyers={ledger.buyers}
        lastPrices={lastPriceBook(ledger)}
        defaultCycleId={cycle}
      />
    </Page>
  );
}
