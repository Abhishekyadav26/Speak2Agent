import { NextResponse } from "next/server";
import { AgentRecord, AgentStatus } from "@/lib/agent-schema";
import { listAgents, saveAgents } from "@/lib/store";
import { randomUUID } from "crypto";

export async function GET() {
  return NextResponse.json({ agents: await listAgents() });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = AgentRecord.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid agent.", issues: parsed.error.issues }, { status: 400 });
  }
  const agents = await listAgents();
  const now = new Date().toISOString();
  const existing = agents.findIndex((a) => a.id === parsed.data.id);
  const record: AgentRecord = { ...parsed.data, updatedAt: now };
  if (existing >= 0) agents[existing] = record;
  else agents.unshift({ ...record, id: record.id || randomUUID(), createdAt: now });
  await saveAgents(agents);
  return NextResponse.json({ agent: record });
}

export async function PATCH(req: Request) {
  // Status transitions with allowlist enforcement.
  const { id, to } = (await req.json().catch(() => ({}))) as { id?: string; to?: AgentStatus };
  const status = AgentStatus.safeParse(to);
  if (!id || !status.success) return NextResponse.json({ error: "Bad transition request." }, { status: 400 });
  const agents = await listAgents();
  const agent = agents.find((a) => a.id === id);
  if (!agent) return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  const { canTransition } = await import("@/lib/agent-schema");
  if (!canTransition(agent.status, status.data)) {
    return NextResponse.json({ error: `Transition ${agent.status} → ${status.data} not allowed.` }, { status: 409 });
  }
  agent.status = status.data;
  agent.updatedAt = new Date().toISOString();
  if (status.data === "AWAITING_APPROVAL") agent.approvedMaxPerOperationUsd = agent.maxPerOperationUsd;
  if (status.data === "READY") agent.approvedAt = new Date().toISOString();
  await saveAgents(agents);
  return NextResponse.json({ agent });
}
