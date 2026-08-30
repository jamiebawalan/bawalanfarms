import Link from "next/link";
import { Card, Note, Page } from "@/components/ui";
import { SheetsRefresh } from "@/components/sheets-refresh";
import { DrivePanel } from "@/components/drive-panel";
import { createAdminClient } from "@/lib/supabase/server";
import { loadLedger } from "@/lib/db/ledger";
import { plotsMissingArea } from "@/lib/domain/plots";
import { todayISO } from "@/lib/domain/dates";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ drive?: string }>;
}) {
  const { drive: driveStatus } = await searchParams;
  const ledger = await loadLedger();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: people } = await supabase.from("app_users").select("email, role, display_name");

  const missingArea = plotsMissingArea(ledger.plots, ledger.plotAreas, todayISO());
  const drive = await readDrive();

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

      <Card title="Google Drive copy">
        <p className="mb-3 text-ink-soft">
          A folder for each plot, a folder inside it for each cycle, and the whole
          history of that cycle as a file you can read on your phone without this
          app. The files are yours — if this app ever stops, the record does not.
          Written on the 1st and 15th, and whenever you press the button.
        </p>
        <DrivePanel
          connected={drive !== null}
          connectedBy={drive?.connected_by ?? null}
          lastMirrorAt={drive?.last_mirror_at ?? null}
          lastError={drive?.last_error ?? null}
          folderId={drive?.root_folder_id ?? null}
          status={driveStatus}
        />
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

/**
 * The Drive connection, read with the service key.
 *
 * google_auth holds a credential, so no policy grants anyone read access to it
 * through the API. Only the server ever looks, and only at the parts that are
 * safe to show — never the token itself.
 */
async function readDrive() {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("google_auth")
      .select("connected_by, last_mirror_at, last_error, root_folder_id")
      .maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
}
