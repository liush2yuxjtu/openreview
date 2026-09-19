import { type NextRequest, NextResponse } from "next/server";

import { getSetupState } from "@/lib/openreview-setup";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

export const GET = (request: NextRequest) => {
  const state = getSetupState();
  const key = request.nextUrl.searchParams.get("key");

  if (key !== state) {
    return new NextResponse("Not found", { status: 404 });
  }

  const setupOrigin = request.nextUrl.origin;
  const productionOrigin = "https://openreview-selfhost.vercel.app";
  const manifest = {
    default_events: ["issue_comment", "pull_request_review_comment"],
    default_permissions: {
      contents: "write",
      issues: "write",
      metadata: "read",
      pull_requests: "write",
    },
    description: "Private OpenReview bot for liush2yuxjtu repositories",
    hook_attributes: {
      active: true,
      url: `${productionOrigin}/api/webhooks`,
    },
    name: "OpenReview liush2yuxjtu",
    public: false,
    redirect_url: `${setupOrigin}/api/openreview-setup/callback`,
    setup_url: `${setupOrigin}/api/openreview-setup/install?state=${encodeURIComponent(state)}`,
    url: productionOrigin,
  };

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>OpenReview GitHub App Setup</title></head>
<body>
  <p>Redirecting to GitHub to create the OpenReview App…</p>
  <form id="setup" action="https://github.com/settings/apps/new?state=${encodeURIComponent(state)}" method="post">
    <input type="hidden" name="manifest" value="${escapeHtml(JSON.stringify(manifest))}">
    <button type="submit">Continue to GitHub</button>
  </form>
  <script>document.getElementById("setup").submit()</script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
    },
  });
};
