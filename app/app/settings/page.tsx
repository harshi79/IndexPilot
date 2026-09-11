"use client";

import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { SettingsPage } from "@/components/settings/settings";

export default function SettingsPageRoute() {
  return (
    <Shell>
      <Suspense>
        <SettingsPage />
      </Suspense>
    </Shell>
  );
}
