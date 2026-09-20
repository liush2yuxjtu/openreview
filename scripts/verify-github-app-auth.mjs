import { App } from "octokit";

const required = [
  "GITHUB_APP_ID",
  "GITHUB_APP_INSTALLATION_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_APP_WEBHOOK_SECRET",
];

const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error("[github-app-preflight] FAIL missing:", missing.join(", "));
  process.exit(1);
}

try {
  const app = new App({
    appId: process.env.GITHUB_APP_ID,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY.replaceAll("\\n", "\n"),
  });

  const appInfo = await app.octokit.rest.apps.getAuthenticated();
  const installation = await app.getInstallationOctokit(
    Number(process.env.GITHUB_APP_INSTALLATION_ID)
  );
  await installation.rest.repos.get({
    owner: "liush2yuxjtu",
    repo: "openreview",
  });

  console.log(
    "[github-app-preflight] PASS",
    JSON.stringify({
      appSlug: appInfo.data.slug,
      installationCanAccessRepo: true,
      webhookSecretConfigured: true,
    })
  );
} catch (error) {
  console.error(
    "[github-app-preflight] FAIL",
    error instanceof Error ? error.message : "Unknown error"
  );
  process.exit(1);
}
