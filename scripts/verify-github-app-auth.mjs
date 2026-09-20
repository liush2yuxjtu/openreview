import { App } from "octokit";

const checks = [
  ["GITHUB_APP_ID", 11],
  ["GITHUB_APP_INSTALLATION_ID", 12],
  ["GITHUB_APP_PRIVATE_KEY", 13],
  ["GITHUB_APP_WEBHOOK_SECRET", 14],
];

for (const [name, code] of checks) {
  if (!process.env[name]?.trim()) {
    console.error("[github-app-preflight] missing required credential");
    process.exit(code);
  }
}

try {
  const app = new App({
    appId: process.env.GITHUB_APP_ID,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY.replaceAll("\\n", "\n"),
  });

  await app.octokit.rest.apps.getAuthenticated();
} catch {
  console.error("[github-app-preflight] app authentication failed");
  process.exit(21);
}

try {
  const app = new App({
    appId: process.env.GITHUB_APP_ID,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY.replaceAll("\\n", "\n"),
  });
  const installation = await app.getInstallationOctokit(
    Number(process.env.GITHUB_APP_INSTALLATION_ID)
  );
  await installation.rest.repos.get({
    owner: "liush2yuxjtu",
    repo: "openreview",
  });
} catch {
  console.error("[github-app-preflight] installation authentication or repo access failed");
  process.exit(22);
}

console.log("[github-app-preflight] PASS");
