import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const apiKey = request.headers.get("x-nim-api-key");

  const nimRes = await fetch("https://integrate.api.nvidia.com/v1/models", {
    headers: {
      Authorization: `Bearer ${apiKey ?? ""}`,
      "Content-Type": "application/json",
    },
  });

  if (!nimRes.ok) {
    return Response.json(
      { error: `NVIDIA NIM error: ${nimRes.status}` },
      { status: nimRes.status }
    );
  }

  const data = await nimRes.json();
  return Response.json(data, {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}