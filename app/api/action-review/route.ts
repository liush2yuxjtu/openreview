import { generateText } from "ai";
import { type NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

const allowedOwner = "liush2yuxjtu";
const maxDiffLength = 120_000;

const githubHeaders = (token: string, accept = "application/vnd.github+json") => ({
  Accept: accept,
  Authorization: `Bearer ${token}`,
  "User-Agent": "openreview-action-bridge",
  "X-GitHub-Api-Version": "2022-11-28",
});

export const POST = async (request: NextRequest) => {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing GitHub token" }, { status: 401 });
  }

  const token = authorization.slice("Bearer ".length);
  const body = (await request.json()) as {
    repository?: string;
    prNumber?: number;
    instructions?: string;
  };

  const repository = body.repository?.trim();
  const prNumber = Number(body.prNumber);
  const instructions = body.instructions?.trim().slice(0, 4_000) ?? "Review this pull request.";

  if (!repository || !Number.isInteger(prNumber) || prNumber <= 0) {
    return NextResponse.json({ error: "Invalid review request" }, { status: 400 });
  }

  const [owner, repo] = repository.split("/");
  if (owner !== allowedOwner || !repo) {
    return NextResponse.json({ error: "Repository is not allowed" }, { status: 403 });
  }

  const prApi = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}`;

  // Using the short-lived GITHUB_TOKEN proves this request came from a workflow
  // that actually has access to the requested repository.
  const prResponse = await fetch(prApi, {
    headers: githubHeaders(token),
    cache: "no-store",
  });

  if (!prResponse.ok) {
    return NextResponse.json(
      { error: "GitHub token cannot access this pull request" },
      { status: prResponse.status === 404 ? 404 : 403 }
    );
  }

  const pr = (await prResponse.json()) as {
    title: string;
    body: string | null;
    base: { ref: string };
    head: { ref: string; sha: string };
  };

  const diffResponse = await fetch(prApi, {
    headers: githubHeaders(token, "application/vnd.github.v3.diff"),
    cache: "no-store",
  });

  if (!diffResponse.ok) {
    return NextResponse.json({ error: "Unable to fetch PR diff" }, { status: 502 });
  }

  const rawDiff = await diffResponse.text();
  const diff =
    rawDiff.length > maxDiffLength
      ? `${rawDiff.slice(0, maxDiffLength)}\n\n[diff truncated]`
      : rawDiff;

  const { text } = await generateText({
    model: "anthropic/claude-sonnet-4.6",
    maxOutputTokens: 2_000,
    system: `You are OpenReview, a careful pull-request reviewer.
Review only the supplied pull request diff and context.
Focus on concrete correctness bugs, security issues, runtime failures, data loss, race conditions, and missing error handling.
Do not nitpick formatting or style.
Do not claim you ran tests unless the supplied evidence says so.
If you find issues, give concise findings with file/line references when possible, impact, and a specific fix.
If you find no blocking issue, say so clearly and mention any verification gap.
Return Markdown suitable for a GitHub pull-request review.`,
    prompt: `Repository: ${repository}
PR: #${prNumber}
Title: ${pr.title}
Base: ${pr.base.ref}
Head: ${pr.head.ref} @ ${pr.head.sha}

Requested review:
${instructions}

PR description:
${pr.body ?? "(none)"}

Diff:
${diff}`,
  });

  const reviewBody = `${text.trim()}

---
*OpenReview · Vercel AI Gateway · triggered by @openreview*`;

  const reviewResponse = await fetch(`${prApi}/reviews`, {
    method: "POST",
    headers: {
      ...githubHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      body: reviewBody,
      event: "COMMENT",
    }),
  });

  if (!reviewResponse.ok) {
    const detail = await reviewResponse.text();
    return NextResponse.json(
      { error: "Failed to publish GitHub review", detail: detail.slice(0, 1_000) },
      { status: 502 }
    );
  }

  const review = (await reviewResponse.json()) as { html_url?: string; id?: number };

  return NextResponse.json({
    ok: true,
    reviewId: review.id,
    reviewUrl: review.html_url,
  });
};
