import Link from "next/link";
import { Button, Card, Empty, Money, Page } from "@/components/ui";
import { loadLedger } from "@/lib/db/ledger";
import { allCyclePnL } from "@/lib/domain/pnl";
import { describeSpan, formatDate, todayISO } from "@/lib/domain/dates";
import { formatPeso } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

export default async function CyclesPage() {
  const ledger = await loadLedger();
  const all = allCyclePnL(ledger);
  const today = todayISO();

  const running = all.filter((c) => !c.isClosed && c.cycle.status !== "planned");
  const planned = all.filter((c) => c.cycle.status === "planned");
  const closed = all
    .filter((c) => c.isClosed)
    .sort((a, b) => (b.cycle.dateClosed ?? "").localeCompare(a.cycle.dateClosed ?? ""));

  return (
    <Page
      title="Cycles"
      subtitle="One crop, in one plot, from land prep to the last harvest"
      action={
        <Link href="/cycles/new">
          <Button size="md">New</Button>
        </Link>
      }
    >
      <Card title={`Running (${running.length})`}>
        {running.length === 0 ? (
          <Empty>Nothing is running.</Empty>
        ) : (
          <ul className="divide-y-2 divide-line">
            {running.map((c) => (
              <li key={c.cycle.id}>
                <Link
                  href={`/cycles/${c.cycle.id}`}
                  className="flex min-h-16 items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {c.plot?.label} · {c.cycle.crop}
                    </div>
                    <div className="text-sm text-ink-soft">
                      {c.cycle.status.replace("_", " ")}
                      {c.cycle.dateStarted
                        ? ` · ${describeSpan(c.cycle.dateStarted, today)} in`
                        : ""}
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
                    {c.plot?.label} · {c.cycle.crop}
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
                      {c.plot?.label} · {c.cycle.crop}
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
