import { type NextRequest, NextResponse } from "next/server";

import {
  getSetupState,
  triggerProductionDeployment,
  upsertProductionEnv,
} from "@/lib/openreview-setup";

export const GET = async (request: NextRequest) => {
  const expectedState = getSetupState();
  const state = request.nextUrl.searchParams.get("state");
  const installationId = request.nextUrl.searchParams.get("installation_id");

  if (
    state !== expectedState ||
    !installationId ||
    !/^\d+$/.test(installationId)
  ) {
    return new NextResponse("Invalid installation callback", { status: 400 });
  }

  await upsertProductionEnv([
    { key: "GITHUB_APP_INSTALLATION_ID", value: installationId },
  ]);
  const deployment = await triggerProductionDeployment();

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>OpenReview Setup Complete</title></head>
<body>
  <h1>OpenReview setup complete</h1>
  <p>GitHub App credentials are stored in Vercel and a fresh production deployment has started.</p>
  <p>Deployment: ${deployment.id ?? "started"}</p>
  <p>You can close this page and return to ChatGPT.</p>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
    },
  });
};
