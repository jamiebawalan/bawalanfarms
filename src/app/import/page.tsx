import { Note, Page } from "@/components/ui";
import { ImportClient } from "@/components/import-client";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <Page
      title="Import history"
      subtitle="The old workbook, checked row by row"
    >
      <Note tone="info">
        Nothing is written until you have seen what would happen. Every row is
        either imported or listed with a reason — none are dropped quietly. A
        corrected file with the same name replaces its own rows rather than
        adding a second copy.
      </Note>
      <ImportClient />
    </Page>
  );
}
