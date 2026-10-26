import { NextResponse } from "next/server";
import { listAgents } from "@/lib/store";
import { listRuns, saveRuns } from "@/lib/store";
import { executeRun, previewPlan } from "@/lib/engine";

export async function GET() {
  return NextResponse.json({ runs: await listRuns() });
}

export async function POST(req: Request) {
  const { agentId, mode, input } = (await req.json().catch(() => ({}))) as {
    agentId?: string;
    mode?: "dry-run" | "live";
    input?: Record<string, unknown>;
  };
  if (!agentId || (mode !== "dry-run" && mode !== "live")) {
    return NextResponse.json({ error: "Provide agentId and mode ('dry-run' | 'live')." }, { status: 400 });
  }
  const agents = await listAgents();
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) return NextResponse.json({ error: "Agent not found." }, { status: 404 });

  if (mode === "dry-run") {
    const run = await executeRun(agent, "dry-run", input);
    const runs = await listRuns();
    runs.unshift(run);
    await saveRuns(runs);
    return NextResponse.json({ run, preview: previewPlan(agent) });
  }

  // LIVE requires READY status (human approved the plan + budget).
  if (agent.status !== "READY" && agent.status !== "SUCCEEDED" && agent.status !== "FAILED") {
    return NextResponse.json(
      { error: `Agent is ${agent.status}. Approve it (CONFIGURED → AWAITING_APPROVAL → READY) before any live spend.` },
      { status: 409 }
    );
  }
  const run = await executeRun(agent, "live", input);
  const runs = await listRuns();
  runs.unshift(run);
  await saveRuns(runs.slice(0, 200));
  return NextResponse.json({ run });
}
