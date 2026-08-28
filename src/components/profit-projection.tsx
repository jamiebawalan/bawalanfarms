"use client";

import { useState } from "react";
import { Card, Field, Input, Money, Note } from "./ui";
import { formatPeso, formatPesoPrecise, parsePeso } from "@/lib/domain/money";

/**
 * What this cycle looks like it will make.
 *
 * One assumption goes in — what a plant is expected to fetch — and the
 * arithmetic is shown rather than hidden. Costs to date are real; everything
 * after them is the owner's estimate, and the screen says which is which. A
 * projection whose workings are invisible gets believed more than it deserves.
 */
export function ProfitProjection({
  plants, costToDateCentavos, revenueSoFarCentavos, defaultPerPlantCentavos,
}: {
  plants: number | null;
  costToDateCentavos: number;
  revenueSoFarCentavos: number;
  /** Seeded from what the farm has actually realised per fruit, when known. */
  defaultPerPlantCentavos: number | null;
}) {
  const [perPlant, setPerPlant] = useState(
    defaultPerPlantCentavos === null ? "" : String(defaultPerPlantCentavos / 100),
  );

  if (plants === null || plants <= 0) {
    return (
      <Card title="What it might make">
        <Note tone="info">
          No plant count on this cycle yet, so there is nothing to project from.
          Record a count and this fills in.
        </Note>
      </Card>
    );
  }

  const parsed = parsePeso(perPlant);
  const projectedRevenue = parsed === null ? null : Math.round(parsed * plants);
  const profit =
    projectedRevenue === null
      ? null
      : projectedRevenue + revenueSoFarCentavos - costToDateCentavos;

  return (
    <Card title="What it might make">
      <Field
        label="Expected revenue per plant"
        htmlFor="per-plant"
        hint={
          defaultPerPlantCentavos !== null
            ? `The farm has realised ${formatPesoPrecise(defaultPerPlantCentavos)} a fruit lately. Change it to test another price.`
            : "Your estimate of what one plant will fetch."
        }
      >
        <Input
          id="per-plant"
          inputMode="decimal"
          value={perPlant}
          onChange={(e) => setPerPlant(e.target.value)}
          placeholder="e.g. 45"
        />
      </Field>

      {profit === null || projectedRevenue === null ? (
        <Note tone="info">Enter a price to see the projection.</Note>
      ) : (
        <>
          <ul className="divide-y-2 divide-line">
            <Row
              label={`${plants.toLocaleString("en-PH")} plants still standing`}
              value={<Money centavos={projectedRevenue} />}
              hint="at the price above"
            />
            {revenueSoFarCentavos > 0 ? (
              <Row
                label="Already sold"
                value={<Money centavos={revenueSoFarCentavos} />}
                hint="real money, not a projection"
              />
            ) : null}
            <Row
              label="Cost so far"
              value={<Money centavos={-costToDateCentavos} />}
              hint="real, and still growing"
            />
          </ul>

          <div className="mt-3 rounded-xl border-2 border-line bg-paper-sunk px-4 py-3">
            <div className="text-sm font-bold uppercase tracking-wide text-ink-soft">
              Projected profit
            </div>
            <div
              className={
                profit >= 0
                  ? "tabular text-3xl font-bold text-money-up"
                  : "tabular text-3xl font-bold text-money-down"
              }
            >
              {formatPeso(profit)}
            </div>
            <div className="text-sm text-ink-soft">
              {formatPesoPrecise(Math.round(profit / plants))} a plant
            </div>
          </div>

          <p className="mt-2 text-sm text-ink-soft">
            Costs will keep rising until the cycle closes, so treat this as the
            best case at today&apos;s spend.
          </p>
        </>
      )}
    </Card>
  );
}

function Row({ label, value, hint }: { label: string; value: React.ReactNode; hint: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="font-semibold">{label}</div>
        <div className="text-sm text-ink-soft">{hint}</div>
      </div>
      {value}
    </li>
  );
}
