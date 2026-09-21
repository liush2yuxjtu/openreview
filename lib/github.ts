import "server-only";
import { App } from "octokit";
import type { Octokit } from "octokit";

import { env } from "@/lib/env";

let app: App | null = null;

const normalizeGitHubPrivateKey = (value: string): string => {
  let key = value.trim();

  if (key.startsWith('"') && key.endsWith('"')) {
    try {
      const parsed = JSON.parse(key);
      if (typeof parsed === "string") {
        key = parsed;
      }
    } catch {
      key = key.slice(1, -1);
    }
  } else if (key.startsWith("'") && key.endsWith("'")) {
    key = key.slice(1, -1);
  }

  key = key
    .replaceAll("\\r", "")
    .replaceAll("\\n", "\n")
    .replaceAll("\r\n", "\n")
    .trim();

  if (!key.includes("-----BEGIN") && /^[A-Za-z0-9+/=\s]+$/.test(key)) {
    try {
      const compact = key.replace(/\s/g, "");
      const decoded = Buffer.from(compact, "base64");
      const decodedText = decoded.toString("utf8").trim();

      if (
        decodedText.includes("-----BEGIN") &&
        decodedText.includes("PRIVATE KEY-----")
      ) {
        key = decodedText.replaceAll("\r\n", "\n");
      } else if (decoded.length >= 512 && decoded[0] === 0x30) {
        const body = compact.match(/.{1,64}/g)?.join("\n") ?? compact;
        key = `-----BEGIN RSA PRIVATE KEY-----\n${body}\n-----END RSA PRIVATE KEY-----`;
      }
    } catch {
      // Fall through to the PEM validation below.
    }
  }

  const isPkcs8 =
    key.startsWith("-----BEGIN PRIVATE KEY-----") &&
    key.endsWith("-----END PRIVATE KEY-----");
  const isPkcs1 =
    key.startsWith("-----BEGIN RSA PRIVATE KEY-----") &&
    key.endsWith("-----END RSA PRIVATE KEY-----");

  if (!(isPkcs8 || isPkcs1)) {
    throw new Error(
      "Invalid GITHUB_APP_PRIVATE_KEY format: expected a complete PEM private key"
    );
  }

  return key;
};

export const getGitHubApp = (): App => {
  if (!app) {
    if (
      !env.GITHUB_APP_ID ||
      !env.GITHUB_APP_PRIVATE_KEY ||
      !env.GITHUB_APP_WEBHOOK_SECRET
    ) {
      throw new Error("Missing required GitHub App environment variables");
    }

    app = new App({
      appId: env.GITHUB_APP_ID,
      privateKey: normalizeGitHubPrivateKey(env.GITHUB_APP_PRIVATE_KEY),
      webhooks: {
        secret: env.GITHUB_APP_WEBHOOK_SECRET,
      },
    });
  }
  return app;
};

export const getInstallationOctokit = (): Promise<Octokit> => {
  if (!env.GITHUB_APP_INSTALLATION_ID) {
    throw new Error("Missing GITHUB_APP_INSTALLATION_ID environment variable");
  }

  const githubApp = getGitHubApp();
  return githubApp.getInstallationOctokit(env.GITHUB_APP_INSTALLATION_ID);
};

export const getAppInfo = async (): Promise<{
  botUserId: number;
  slug: string;
}> => {
  const octokit = await getInstallationOctokit();
  const { data: appData } = (await octokit.request("GET /app")) as {
    data: { slug: string };
  };
  const { data: botUser } = await octokit.request("GET /users/{username}", {
    username: `${appData.slug}[bot]`,
  });

  return { botUserId: botUser.id, slug: appData.slug };
};
