import { Page } from "@/components/ui";
import { CostReview } from "@/components/cost-review";
import { loadCostReview } from "@/lib/db/cost-review";
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

  // Active only, and never "other": this screen exists to empty it.
  const activities = ledger.activities
    .filter((a) => a.active !== false && a.code !== "other")
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
