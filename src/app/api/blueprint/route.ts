import { NextResponse } from "next/server";
import { AgentBlueprint } from "@/lib/agent-schema";
import { requestToBlueprint } from "@/lib/templates";

// Optional LLM upgrade: if AI_GATEWAY_URL + AI_API_KEY are set, ask the model
// for a refined objective line only — structure always comes from the validator.
async function refineObjective(request: string): Promise<string | null> {
  const url = process.env.AI_GATEWAY_URL;
  const key = process.env.AI_API_KEY;
  if (!url || !key) return null;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.AI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: "Rewrite the user's agent request as one crisp objective sentence. Reply with only that sentence." },
          { role: "user", content: request },
        ],
        max_tokens: 120,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    return j.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let body: { request?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const request = (body.request || "").toString().slice(0, 2000);
  if (request.trim().length < 10) {
    return NextResponse.json({ error: "Describe the agent in at least a few words." }, { status: 400 });
  }
  const blueprint = requestToBlueprint(request);
  const refined = await refineObjective(request);
  if (refined) blueprint.objective = refined.slice(0, 500);
  const parsed = AgentBlueprint.safeParse(blueprint);
  if (!parsed.success) {
    return NextResponse.json({ error: "Blueprint validation failed.", issues: parsed.error.issues }, { status: 500 });
  }
  return NextResponse.json({ blueprint: parsed.data, llmEnhanced: Boolean(refined) });
}
