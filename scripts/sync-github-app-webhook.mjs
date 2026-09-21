import { App } from "octokit";

const normalizePrivateKey = (value) => {
  let key = value.trim();

  if (key.startsWith('"') && key.endsWith('"')) {
    try {
      const parsed = JSON.parse(key);
      if (typeof parsed === "string") key = parsed;
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
  }

  return key;
};

if (process.env.VERCEL_ENV !== "production") {
  console.log("[webhook-sync] skipped outside production");
  process.exit(0);
}

const appId = process.env.GITHUB_APP_ID;
const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;

if (!appId || !privateKey || !secret) {
  throw new Error("[webhook-sync] missing required GitHub App environment variables");
}

const app = new App({
  appId,
  privateKey: normalizePrivateKey(privateKey),
});

await app.octokit.request("PATCH /app/hook/config", {
  url: "https://openreview-selfhost.vercel.app/api/webhooks",
  content_type: "json",
  secret,
  insecure_ssl: "0",
  headers: {
    "x-github-api-version": "2026-03-10",
  },
});

const { data: config } = await app.octokit.request("GET /app/hook/config", {
  headers: {
    "x-github-api-version": "2026-03-10",
  },
});

if (
  config.url !== "https://openreview-selfhost.vercel.app/api/webhooks" ||
  config.content_type !== "json"
) {
  throw new Error("[webhook-sync] GitHub returned unexpected webhook configuration");
}

console.log("[webhook-sync] GitHub App webhook configuration synchronized");
