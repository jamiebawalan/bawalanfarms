import { Note, Page } from "@/components/ui";
import { LogTabs } from "@/components/log-tabs";
import { DrawForm } from "@/components/inputs-client";
import { loadStockScreen } from "@/lib/db/stock-screen";

export const dynamic = "force-dynamic";

/**
 * Using stock on a plot. This is the moment a bulk purchase becomes a cost.
 *
 * There is a second way in, on the plot page itself, which asks for the
 * whole round at once. This one asks lot by lot, which is the right shape
 * when you are standing at the shed with the sack in front of you.
 */
export default async function UseInputsPage() {
  const { lotOptions, openCycles } = await loadStockScreen();

  return (
    <Page title="Use inputs" subtitle="This is where stock becomes a cost.">
      <LogTabs />

      <DrawForm lots={lotOptions} cycles={openCycles} />

      <Note tone="info">
        Using several things on one plot at once? The plot&rsquo;s own page
        asks for the whole round on one screen.
      </Note>
    </Page>
  );
}
