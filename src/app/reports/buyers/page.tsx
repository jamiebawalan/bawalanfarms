import { Card, Empty, Money, Note, Page } from "@/components/ui";
import { loadLedger } from "@/lib/db/ledger";
import { buyerMargins } from "@/lib/domain/reports";
import { formatDate } from "@/lib/domain/dates";
import { formatPeso } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

export default async function BuyersPage() {
  const ledger = await loadLedger();
  const rows = buyerMargins(ledger);
  const productLabel = new Map(ledger.products.map((p) => [p.code, p.label]));

  return (
    <Page title="Buyer margin" subtitle="What each buyer actually paid, by grade">
      {rows.length === 0 ? (
        <Card><Empty>No sales recorded yet.</Empty></Card>
      ) : (
        rows.map((b) => (
          <Card
            key={b.buyerId}
            title={b.buyerName}
            action={<Money centavos={b.revenueCentavos} />}
          >
            <p className="mb-3 text-sm text-ink-soft">
              {b.saleCount} {b.saleCount === 1 ? "sale" : "sales"}
              {b.lastSaleDate ? `, last on ${formatDate(b.lastSaleDate)}` : ""}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b-2 border-line text-xs uppercase tracking-wide text-ink-soft">
                    <th className="py-2 pr-3 font-bold">Grade</th>
                    <th className="py-2 pr-3 text-right font-bold">Qty</th>
                    <th className="py-2 pr-3 text-right font-bold">Realised</th>
                    <th className="py-2 pr-3 text-right font-bold">Range</th>
                    <th className="py-2 text-right font-bold">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-line">
                  {b.byProduct.map((p) => (
                    <tr key={p.product} className="tabular">
                      <td className="py-2.5 pr-3 font-semibold">
                        {productLabel.get(p.product) ?? p.product}
                      </td>
                      <td className="py-2.5 pr-3 text-right">
                        {p.quantity.toLocaleString("en-PH")}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-semibold">
                        {formatPeso(p.averagePriceCentavos)}
                      </td>
                      <td className="py-2.5 pr-3 text-right text-ink-soft">
                        {p.minPriceCentavos === p.maxPriceCentavos
                          ? "—"
                          : `${formatPeso(p.minPriceCentavos)}–${formatPeso(p.maxPriceCentavos)}`}
                      </td>
                      <td className="py-2.5 text-right">
                        <Money centavos={p.revenueCentavos} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))
      )}

      <Note tone="info">
        "Realised" is revenue divided by quantity, not a list price. Lines marked
        as a bulk dump are left out so they do not drag the average down.
      </Note>
    </Page>
  );
}
