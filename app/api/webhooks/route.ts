import { after, NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getBot } from "@/lib/bot";
import { env } from "@/lib/env";
import { getGitHubApp } from "@/lib/github";

const webhookUrl = "https://openreview-selfhost.vercel.app/api/webhooks";

const repairWebhookSecret = async (deliveryGuid: string): Promise<void> => {
  const secret = env.GITHUB_APP_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[openreview-webhook-auth] repair skipped: missing webhook secret");
    return;
  }

  try {
    // Let GitHub finish recording the failed delivery before looking it up.
    await new Promise((resolve) => setTimeout(resolve, 750));

    const app = getGitHubApp();
    const { data: deliveries } = await app.octokit.request(
      "GET /app/hook/deliveries",
      {
        per_page: 30,
        headers: {
          "x-github-api-version": "2026-03-10",
        },
      }
    );

    const delivery = deliveries.find((item) => item.guid === deliveryGuid);
    if (!delivery) {
      console.warn("[openreview-webhook-auth] repair skipped: delivery not found");
      return;
    }

    await app.octokit.request("PATCH /app/hook/config", {
      url: webhookUrl,
      content_type: "json",
      secret,
      insecure_ssl: "0",
      headers: {
        "x-github-api-version": "2026-03-10",
      },
    });

    await app.octokit.request("POST /app/hook/deliveries/{delivery_id}/attempts", {
      delivery_id: delivery.id,
      headers: {
        "x-github-api-version": "2026-03-10",
      },
    });

    console.warn("[openreview-webhook-auth] webhook secret synchronized and redelivery requested", {
      deliveryId: delivery.id,
    });
  } catch (error) {
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : undefined;

    console.error("[openreview-webhook-auth] repair failed", { status });
  }
};

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const bot = await getBot();
  const handler = bot.webhooks.github;

  if (!handler) {
    return NextResponse.json(
      { error: "GitHub adapter not configured" },
      { status: 404 }
    );
  }

  const response = (await handler(request, {
    waitUntil: (task) => after(() => task),
  })) as NextResponse;

  if (response.status === 401) {
    const userAgent = request.headers.get("user-agent");
    const deliveryGuid = request.headers.get("x-github-delivery");
    const hasSignature256 = Boolean(
      request.headers.get("x-hub-signature-256")
    );
    const isGitHubHookshot =
      userAgent?.startsWith("GitHub-Hookshot/") ?? false;

    console.warn("[openreview-webhook-auth]", {
      event: request.headers.get("x-github-event"),
      hasDeliveryId: Boolean(deliveryGuid),
      hasSignature256,
      signature256Length:
        request.headers.get("x-hub-signature-256")?.length ?? 0,
      isGitHubHookshot,
    });

    if (deliveryGuid && hasSignature256 && isGitHubHookshot) {
      after(() => repairWebhookSecret(deliveryGuid));
    }
  }

  return response;
};
