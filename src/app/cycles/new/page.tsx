import { Page } from "@/components/ui";
import { NewCycleForm } from "@/components/new-cycle-form";
import { loadLedger } from "@/lib/db/ledger";
import { todayISO } from "@/lib/domain/dates";
import { plotIsOccupiedOn } from "@/lib/domain/allocation";

export const dynamic = "force-dynamic";

export default async function NewCyclePage() {
  const ledger = await loadLedger();
  const today = todayISO();

  return (
    <Page
      title="Start a cycle"
      subtitle="A plot can only run one cycle at a time"
    >
      <NewCycleForm
        crops={ledger.crops}
        plots={ledger.plots
          .filter((p) => p.active)
          .map((p) => {
            const live = ledger.cycles.find(
              (c) => c.plotId === p.id && plotIsOccupiedOn(c, today),
            );
            const queued = ledger.cycles.find(
              (c) => c.plotId === p.id && c.status === "planned",
            );
            return {
              id: p.id,
              code: p.code,
              label: p.label,
              busyWith: live ? live.crop : null,
              hasPlanned: Boolean(queued),
            };
          })}
      />
    </Page>
  );
}
