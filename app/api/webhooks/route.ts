import { setTimeout as delay } from "node:timers/promises";

import { after, NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getBot } from "@/lib/bot";
import { env } from "@/lib/env";
import { getGitHubApp } from "@/lib/github";

const webhookUrl = "https://openreview-selfhost.vercel.app/api/webhooks";

const repairWebhookSecret = async (deliveryGuid: string): Promise<void> => {
  const secret = env.GITHUB_APP_WEBHOOK_SECRET;
  if (!secret) {
    console.error(
      "[openreview-webhook-auth] repair skipped: missing webhook secret"
    );
    return;
  }

  let repairStep = "delay";

  try {
    // Let GitHub finish recording the failed delivery before looking it up.
    await delay(750);

    repairStep = "get-app";
    const app = getGitHubApp();
    repairStep = "list-deliveries";
    const { data: deliveries } = await app.octokit.request(
      "GET /app/hook/deliveries",
      {
        headers: {
          "x-github-api-version": "2026-03-10",
        },
        per_page: 30,
      }
    );

    const delivery = deliveries.find((item) => item.guid === deliveryGuid);
    if (!delivery) {
      console.warn(
        "[openreview-webhook-auth] repair skipped: delivery not found"
      );
      return;
    }

    repairStep = "patch-hook";
    await app.octokit.request("PATCH /app/hook/config", {
      data: {
        content_type: "json",
        insecure_ssl: "0",
        secret,
        url: webhookUrl,
      },
      headers: {
        "x-github-api-version": "2026-03-10",
      },
    });

    repairStep = "redeliver";
    await app.octokit.request(
      "POST /app/hook/deliveries/{delivery_id}/attempts",
      {
        delivery_id: delivery.id,
        headers: {
          "x-github-api-version": "2026-03-10",
        },
      }
    );

    console.warn(
      "[openreview-webhook-auth] webhook secret synchronized and redelivery requested",
      {
        deliveryId: delivery.id,
      }
    );
  } catch (error) {
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : undefined;

    const errorName = error instanceof Error ? error.name : typeof error;

    console.error("[openreview-webhook-auth] repair failed", {
      errorName,
      repairStep,
      status,
    });
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
    const hasSignature256 = Boolean(request.headers.get("x-hub-signature-256"));
    const isGitHubHookshot = userAgent?.startsWith("GitHub-Hookshot/") ?? false;

    console.warn("[openreview-webhook-auth]", {
      event: request.headers.get("x-github-event"),
      hasDeliveryId: Boolean(deliveryGuid),
      hasSignature256,
      isGitHubHookshot,
      signature256Length:
        request.headers.get("x-hub-signature-256")?.length ?? 0,
    });

    if (deliveryGuid && hasSignature256 && isGitHubHookshot) {
      after(() => repairWebhookSecret(deliveryGuid));
    }
  }

  return response;
};
