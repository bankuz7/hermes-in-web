import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const apiKey = request.headers.get("x-nim-api-key") ?? "";
  const shouldStream = body.stream === true;

  const nimRes = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!nimRes.ok) {
    const text = await nimRes.text().catch(() => "");
    return Response.json(
      { error: `NVIDIA NIM ${nimRes.status}: ${text}` },
      { status: nimRes.status }
    );
  }

  // Non-streaming: parse and return JSON
  if (!shouldStream) {
    const data = await nimRes.json();
    return Response.json(data);
  }

  // Streaming: pipe SSE response back to client
  if (!nimRes.body) {
    return Response.json({ error: "No response body" }, { status: 500 });
  }

  const outStream = new ReadableStream({
    async start(controller) {
      const reader = nimRes.body!.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      } catch (e: unknown) {
        controller.error(e);
      }
    },
  });

  return new Response(outStream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}