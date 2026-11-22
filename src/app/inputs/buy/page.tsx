import { Money, Note, Page, Stat, StatGrid } from "@/components/ui";
import { LogTabs } from "@/components/log-tabs";
import { PurchaseForm } from "@/components/inputs-client";
import { loadStockScreen } from "@/lib/db/stock-screen";
import { formatPeso } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

/**
 * Buying stock.
 *
 * Deliberately not a cost. It becomes one the day it is drawn, on the plot
 * that used it — which is why this sits beside logging a cost rather than
 * inside it.
 */
export default async function BuyInputsPage() {
  const { inputTypes, stockValueCentavos, open } = await loadStockScreen();

  return (
    <Page title="Buy inputs" subtitle="Buying is not a cost. Using is.">
      <LogTabs />

      <StatGrid>
        <Stat label="Lots open" value={String(open.length)} />
        <Stat
          label="Stock on hand"
          value={formatPeso(stockValueCentavos)}
          hint="not yet a cost"
        />
      </StatGrid>

      <PurchaseForm inputTypes={inputTypes} />

      <Note tone="info">
        Money spent here has left the float, but no plot has been charged for
        it. That happens under <strong>Use inputs</strong>, on the plot that
        used it.
      </Note>
    </Page>
  );
}
