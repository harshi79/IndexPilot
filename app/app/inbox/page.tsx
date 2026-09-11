"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Shell } from "@/components/shell";
import { MailView } from "@/components/mail/mail-view";
import type { MailView as MailViewT } from "@/lib/mail/types";

const VALID: MailViewT[] = ["inbox", "starred", "sent", "drafts", "archive", "trash"];

function InboxInner() {
  const params = useSearchParams();
  const raw = params.get("view") || "inbox";
  const view = (VALID.includes(raw as MailViewT) ? raw : "inbox") as MailViewT;
  return <MailView view={view} />;
}

export default function InboxPage() {
  return (
    <Shell>
      <Suspense>
        <InboxInner />
      </Suspense>
    </Shell>
  );
}
