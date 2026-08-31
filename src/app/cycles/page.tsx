import Link from "next/link";
import { Button, Card, Empty, Money, Page } from "@/components/ui";
import { loadLedger } from "@/lib/db/ledger";
import { allCyclePnL } from "@/lib/domain/pnl";
import { formatDate, todayISO } from "@/lib/domain/dates";
import { cycleAgeMonths, groupByBand } from "@/lib/domain/age";
import { formatPeso } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

export default async function CyclesPage() {
  const ledger = await loadLedger();
  const cropNames = new Map(ledger.crops.map((c) => [c.code, c.label]));
  const cropLabel = (code: string) => cropNames.get(code) ?? code;
  const all = allCyclePnL(ledger);
  const today = todayISO();

  const running = all.filter((c) => !c.isClosed && c.cycle.status !== "planned");
  // Banded by age so the plots on screen together are ones worth comparing:
  // nineteen months against eighteen, never against ten.
  const banded = groupByBand(running, (c) => c, today);
  const planned = all.filter((c) => c.cycle.status === "planned");
  const closed = all
    .filter((c) => c.isClosed)
    .sort((a, b) => (b.cycle.dateClosed ?? "").localeCompare(a.cycle.dateClosed ?? ""));

  return (
    <Page
      title="Cycles"
      subtitle="One crop, in one plot, from land prep to the last harvest"
      action={
        <div className="flex items-center gap-3">
          <Link href="/map" className="font-semibold text-brand underline underline-offset-4">
            Map
          </Link>
          <Link href="/cycles/new">
            <Button size="md">New</Button>
          </Link>
        </div>
      }
    >
      <Card title={`Running (${running.length})`}>
        {running.length === 0 ? (
          <Empty>Nothing is running.</Empty>
        ) : (
          <>
          {banded.map(({ band, items }) => (
          <section key={band?.key ?? "rest"}>
            <h3 className="mt-4 text-xs font-bold uppercase tracking-wide text-ink-soft first:mt-0">
              {band === null ? "Everything else" : band.label}
              {band !== null ? (
                <span className="ml-2 font-medium normal-case tracking-normal">
                  {band.hint}
                </span>
              ) : null}
            </h3>
          <ul className="divide-y-2 divide-line">
            {items.map((c) => (
              <li key={c.cycle.id}>
                <Link
                  href={`/cycles/${c.cycle.id}`}
                  className="flex min-h-16 items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {c.plot?.label} · {cropLabel(c.cycle.crop)}
                    </div>
                    <div className="text-sm text-ink-soft">
                      {(() => {
                        const months = cycleAgeMonths(c.cycle, today);
                        return months === null ? "not started" : `${months} months in`;
                      })()}
                      {" · "}
                      {c.cycle.status.replace("_", " ")}
                    </div>
                  </div>
                  <div className="text-right">
                    <Money centavos={c.grossMarginCentavos} signed />
                    <div className="text-xs text-ink-soft">
                      {formatPeso(c.totalCostCentavos)} spent
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          </section>
          ))}
          </>
        )}
      </Card>

      {planned.length > 0 ? (
        <Card title={`Planned (${planned.length})`}>
          <ul className="divide-y-2 divide-line">
            {planned.map((c) => (
              <li key={c.cycle.id}>
                <Link
                  href={`/cycles/${c.cycle.id}`}
                  className="flex min-h-14 items-center justify-between py-3"
                >
                  <span className="font-semibold">
                    {c.plot?.label} · {cropLabel(c.cycle.crop)}
                  </span>
                  <span className="text-sm text-ink-soft">not started</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card title={`Closed (${closed.length})`}>
        {closed.length === 0 ? (
          <Empty>No cycle has been closed yet.</Empty>
        ) : (
          <ul className="divide-y-2 divide-line">
            {closed.map((c) => (
              <li key={c.cycle.id}>
                <Link
                  href={`/cycles/${c.cycle.id}`}
                  className="flex min-h-16 items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {c.plot?.label} · {cropLabel(c.cycle.crop)}
                    </div>
                    <div className="text-sm text-ink-soft">
                      closed {formatDate(c.cycle.dateClosed)}
                    </div>
                  </div>
                  <Money centavos={c.grossMarginCentavos} signed />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Page>
  );
}
