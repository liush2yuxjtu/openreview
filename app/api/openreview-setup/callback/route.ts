import { type NextRequest, NextResponse } from "next/server";

import { getSetupState, upsertProductionEnv } from "@/lib/openreview-setup";

type ManifestConversion = {
  id: number;
  pem: string;
  slug: string;
  webhook_secret: string;
};

export const GET = async (request: NextRequest) => {
  const expectedState = getSetupState();
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!code || state !== expectedState) {
    return new NextResponse("Invalid setup callback", { status: 400 });
  }

  const conversionResponse = await fetch(
    `https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
      },
      method: "POST",
    }
  );

  if (!conversionResponse.ok) {
    return new NextResponse(
      `GitHub App conversion failed: ${conversionResponse.status}`,
      { status: 502 }
    );
  }

  const app = (await conversionResponse.json()) as ManifestConversion;
  await upsertProductionEnv([
    { key: "GITHUB_APP_ID", value: String(app.id) },
    {
      key: "GITHUB_APP_PRIVATE_KEY",
      value: app.pem.replaceAll("\n", "\\n"),
    },
    { key: "GITHUB_APP_WEBHOOK_SECRET", value: app.webhook_secret },
  ]);

  const installUrl = new URL(
    `https://github.com/apps/${encodeURIComponent(app.slug)}/installations/new`
  );
  installUrl.searchParams.set("state", expectedState);

  return NextResponse.redirect(installUrl);
};
