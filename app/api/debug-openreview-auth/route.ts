import { NextResponse } from "next/server";

import { getAppInfo, getInstallationOctokit } from "@/lib/github";

export const GET = async () => {
  try {
    const appInfo = await getAppInfo();
    const octokit = await getInstallationOctokit();
    await octokit.rest.repos.get({
      owner: "liush2yuxjtu",
      repo: "openreview",
    });

    return NextResponse.json({
      ok: true,
      appSlug: appInfo.slug,
      installationCanAccessRepo: true,
      webhookSecretConfigured: Boolean(process.env.GITHUB_APP_WEBHOOK_SECRET),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        installationCanAccessRepo: false,
        webhookSecretConfigured: Boolean(process.env.GITHUB_APP_WEBHOOK_SECRET),
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
};
