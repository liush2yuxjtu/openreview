import { after, NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getBot } from "@/lib/bot";

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

    console.warn("[openreview-webhook-auth]", {
      event: request.headers.get("x-github-event"),
      hasDeliveryId: Boolean(request.headers.get("x-github-delivery")),
      hasSignature256: Boolean(request.headers.get("x-hub-signature-256")),
      signature256Length:
        request.headers.get("x-hub-signature-256")?.length ?? 0,
      isGitHubHookshot: userAgent?.startsWith("GitHub-Hookshot/") ?? false,
    });
  }

  return response;
};
