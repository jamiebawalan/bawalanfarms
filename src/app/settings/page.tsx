import Link from "next/link";
import { Card, Note, Page } from "@/components/ui";
import { SheetsRefresh } from "@/components/sheets-refresh";
import { loadLedger } from "@/lib/db/ledger";
import { plotsMissingArea } from "@/lib/domain/plots";
import { todayISO } from "@/lib/domain/dates";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ledger = await loadLedger();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: people } = await supabase.from("app_users").select("email, role, display_name");

  const missingArea = plotsMissingArea(ledger.plots, ledger.plotAreas, todayISO());

  return (
    <Page title="Settings" subtitle={user?.email ?? undefined}>
      {missingArea.length > 0 ? (
        <Note tone="warn">
          {missingArea.map((p) => p.label).join(", ")} has no surveyed area, so it
          cannot take a share of any split or of whole-farm costs. Set the area to
          bring it in.
        </Note>
      ) : null}

      <Card title="Google Sheets copy">
        <p className="mb-3 text-ink-soft">
          A read-only mirror, refreshed nightly and on demand. Nothing is ever read
          back from Sheets — that is what let the old workbook drift.
        </p>
        <SheetsRefresh />
      </Card>

      <Card title="Import history">
        <p className="mb-3 text-ink-soft">
          Load the old workbook. Every row is either imported or listed with a
          reason.
        </p>
        <Link
          href="/import"
          className="font-semibold text-brand underline underline-offset-4"
        >
          Open the importer
        </Link>
      </Card>

      <Card title="Who can sign in">
        <ul className="divide-y-2 divide-line">
          {(people ?? []).map((p) => (
            <li key={p.email} className="flex justify-between gap-3 py-2.5">
              <span>{p.display_name}</span>
              <span className="text-ink-soft">{p.role}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-ink-soft">
          Access is the app_users table and nothing else. Adding or removing a row
          is the whole operation — there is no second list to keep in step.
        </p>
      </Card>
    </Page>
  );
}
