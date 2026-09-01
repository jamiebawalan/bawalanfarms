import { Card, Page } from "@/components/ui";

export const dynamic = "force-static";

export const metadata = {
  title: "Privacy — Farm Tracker",
  description: "What Farm Tracker does with your Google data.",
};

/**
 * The privacy policy, public and unauthenticated.
 *
 * Google requires an external app to publish a privacy policy before it will
 * leave Testing, and requires it to be reachable without signing in. It also
 * has to be true, which is the easier half here: this app is used by three
 * people on one farm and does almost nothing with anybody's data.
 */
export default function PrivacyPage() {
  return (
    <Page title="Privacy" subtitle="Last updated 30 August 2026">
      <Card>
        <div className="space-y-4">
          <p>
            Farm Tracker is a private record-keeping app for one family farm in
            Silang, Cavite. It is used by the farm&apos;s owners and its manager.
            It is not offered to the public and has no other users.
          </p>

          <h2 className="text-lg font-bold">What the app holds</h2>
          <p>
            Costs, harvests, sales, plant counts, D-leaf measurements, tasks and
            photographs of the farm&apos;s own plots, together with the email
            addresses of the three people allowed to sign in. Nothing else.
          </p>

          <h2 className="text-lg font-bold">Google data the app uses</h2>
          <p>
            With the owner&apos;s permission, the app uses the{" "}
            <code className="rounded bg-paper-sunk px-1">drive.file</code> scope
            of the Google Drive API. That permission covers only the files this
            app itself creates. It cannot see, open or alter anything else in the
            owner&apos;s Google Drive.
          </p>
          <p>The app uses it to do one thing: keep a copy of the farm&apos;s
            own records — a folder for each plot, a folder for each crop cycle, a
            readable history file, and photographs taken in the field — inside a
            folder in the owner&apos;s Drive, so the record survives independently
            of this app.
          </p>

          <h2 className="text-lg font-bold">What the app does not do</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>It does not sell, rent or share data with anyone.</li>
            <li>It does not use Google user data for advertising.</li>
            <li>It does not use Google user data to train any model.</li>
            <li>It has no analytics, trackers or advertising of any kind.</li>
            <li>It does not read files in Drive that it did not create.</li>
          </ul>

          <h2 className="text-lg font-bold">Where things are stored</h2>
          <p>
            Farm records are held in a private Postgres database (Supabase) and
            the app runs on Vercel. Files written to Google Drive belong to the
            Google account that granted permission, and stay in that account.
          </p>

          <h2 className="text-lg font-bold">Claude</h2>
          <p>
            When someone presses &quot;Ask Claude&quot; on a plot, that
            plot&apos;s measurements, costs and recent photographs are sent to
            Anthropic&apos;s API to produce suggested tasks. Nothing is sent
            unless that button is pressed, and Anthropic does not train on data
            sent through its API.
          </p>

          <h2 className="text-lg font-bold">Withdrawing permission</h2>
          <p>
            Google Drive access can be revoked at any time at{" "}
            <a
              href="https://myaccount.google.com/permissions"
              className="font-semibold text-brand underline underline-offset-4"
            >
              myaccount.google.com/permissions
            </a>
            . Files already written stay in the owner&apos;s Drive and can be
            deleted there like any other file.
          </p>

          <h2 className="text-lg font-bold">Contact</h2>
          <p>
            <a
              href="mailto:jamie.bawalan@gmail.com"
              className="font-semibold text-brand underline underline-offset-4"
            >
              jamie.bawalan@gmail.com
            </a>
          </p>
        </div>
      </Card>
    </Page>
  );
}
