import { Page } from "@/components/ui";
import { CostReview } from "@/components/cost-review";
import { UNSETTLED_CODES, loadCostReview } from "@/lib/db/cost-review";
import { loadLedger } from "@/lib/db/ledger";

export const dynamic = "force-dynamic";

/**
 * The costs that are filed under a word instead of an activity.
 *
 * "Other" was the largest single line on some plots — ₱397,876 across the
 * hundred commonest phrases — because it was the nearest field, not because
 * the work was unrecordable. The entry screen stops new ones accumulating;
 * this clears what is already there.
 */
export default async function CostReviewPage() {
  const [items, ledger] = await Promise.all([loadCostReview(), loadLedger()]);

  /*
   * Active, and never a destination this screen exists to empty.
   *
   * The unsettled codes are still active so their expenses are not stranded,
   * which meant they were in the list the matcher searches — and a row's own
   * label matches itself perfectly, so "Fruiting Formula" suggested Fruiting
   * Formula. Tapping it would have been accepted and the row would have left
   * the queue with nothing changed: work marked done that was not done.
   */
  const activities = ledger.activities
    .filter(
      (a) =>
        a.active !== false &&
        a.code !== "other" &&
        !(UNSETTLED_CODES as readonly string[]).includes(a.code),
    )
    .map((a) => ({
      code: a.code,
      label: a.label,
      activityGroup: a.activityGroup,
    }));

  return (
    <Page
      title="Tidy up the costs"
      subtitle="Everything still filed under a word rather than an activity"
    >
      <CostReview items={items} activities={activities} />
    </Page>
  );
}
