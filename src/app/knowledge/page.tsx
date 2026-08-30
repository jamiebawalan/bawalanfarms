import Link from "next/link";
import { Card, Empty, Note, Page } from "@/components/ui";
import {
  DECISIONS, ENTITIES, KNOWLEDGE, OPEN_ITEMS, TIMELINE,
} from "@/lib/advice/knowledge";
import { formatDate } from "@/lib/domain/dates";

export const dynamic = "force-static";

/**
 * What the farm knows.
 *
 * Eighteen months of the owners' agronomy thinking, kept where they can read it
 * back. This page exists because the suggestions on the plot pages are built
 * from this record: if a suggestion looks wrong, this is where you find out
 * why, and if the record is wrong, this is what needs correcting.
 *
 * It reads from the repository, not the database, so it works whether or not
 * anyone has logged in or run a migration.
 */
export default function KnowledgePage() {
  const settled = DECISIONS.filter((d) => d.status === "active");
  const testing = DECISIONS.filter((d) => d.status === "trial");
  const weighing = DECISIONS.filter(
    (d) => d.status !== "active" && d.status !== "trial",
  );
  const recent = [...TIMELINE].sort((a, b) => b.date.localeCompare(a.date));
  const byType = new Map<string, typeof ENTITIES>();
  for (const e of ENTITIES) {
    byType.set(e.type, [...(byType.get(e.type) ?? []), e]);
  }

  return (
    <Page
      title="What the farm knows"
      subtitle={`Exported from eighteen months of farming notes on ${formatDate(KNOWLEDGE.exportedOn)}`}
    >
      <Note tone="info">
        Every suggestion on a plot page is made from this record. If a suggestion
        looks wrong, read the decision it cites. If the record is wrong, this is
        what needs changing.
      </Note>

      <Card title="Settled practice">
        <DecisionList decisions={settled} />
      </Card>

      <Card title="Being tested">
        <p className="mb-3 text-sm text-ink-soft">
          Not yet practice. A trial becomes practice when its result is in and
          someone decides — not by drifting there.
        </p>
        <DecisionList decisions={testing} />
      </Card>

      {weighing.length > 0 ? (
        <Card title="Still being weighed">
          <DecisionList decisions={weighing} />
        </Card>
      ) : null}

      <Card title="Questions with no answer yet">
        <p className="mb-3 text-sm text-ink-soft">
          The open loops. A suggestion that closes one is worth more than a
          suggestion that does not.
        </p>
        <ul className="divide-y-2 divide-line">
          {OPEN_ITEMS.map((o) => (
            <li key={o.id} className="py-3">
              <div className="flex items-baseline gap-2">
                <span className="shrink-0 font-mono text-xs font-bold text-brand">
                  {o.id}
                </span>
                <span className="font-semibold">{o.question}</span>
              </div>
              <p className="mt-1 pl-9 text-sm text-ink-soft">
                <span className="font-semibold">Next step:</span> {o.next_step}
              </p>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Things the farm works with">
        {byType.size === 0 ? (
          <Empty>Nothing recorded.</Empty>
        ) : (
          <dl className="space-y-3">
            {[...byType.entries()].map(([type, items]) => (
              <div key={type}>
                <dt className="text-xs font-bold uppercase tracking-wide text-ink-soft">
                  {type.replace(/_/g, " ")}
                </dt>
                <dd className="mt-0.5 text-sm">
                  {items.map((e) => e.name).join(" · ")}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      <Card title="How the thinking got here">
        <ul className="space-y-2">
          {recent.map((e) => (
            <li key={`${e.date}-${e.event.slice(0, 20)}`} className="text-sm">
              <span className="font-semibold">{formatDate(e.date)}</span>
              <span className="text-ink-soft"> — {e.event}</span>
            </li>
          ))}
        </ul>
      </Card>

      <p className="mt-6 text-center text-sm">
        <Link href="/cycles" className="font-semibold text-brand">
          Go to the plots
        </Link>
      </p>
    </Page>
  );
}

function DecisionList({
  decisions,
}: {
  decisions: readonly (typeof DECISIONS)[number][];
}) {
  if (decisions.length === 0) return <Empty>Nothing here yet.</Empty>;
  return (
    <ul className="divide-y-2 divide-line">
      {decisions.map((d) => (
        <li key={d.id} className="py-3">
          <div className="flex items-baseline gap-2">
            <span className="shrink-0 font-mono text-xs font-bold text-brand">
              {d.id}
            </span>
            <span className="font-semibold">{d.decision}</span>
          </div>
          {d.rationale !== undefined ? (
            <p className="mt-1 pl-9 text-sm text-ink-soft">{d.rationale}</p>
          ) : null}
          {d.metrics !== undefined ? (
            <p className="mt-1 pl-9 text-sm text-ink-soft">
              Measured by: {d.metrics.join(", ").replace(/_/g, " ")}
            </p>
          ) : null}
          {d.confidence !== undefined ? (
            <p className="mt-1 pl-9 text-xs uppercase tracking-wide text-ink-soft">
              {d.confidence} confidence
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
