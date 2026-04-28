/**
 * 坐席侧 tool 调用 — agent-bff 透传到 tool-svc。
 *
 * 不带 dry_run 时,写工具默认 dry_run=true(由 tool-svc 决定)。坐席界面默认
 * 都是查询类工具,只用 read 路径。
 */

export interface ToolInvokeResponse {
  ok: boolean;
  result?: Record<string, unknown>;
  error?: string;
  duration_ms?: number;
  audit_id?: string;
}

export interface ToolCtx {
  session_id?: string;
  uid?: number;
  dry_run?: boolean;
  live_context?: Record<string, unknown>;
}

export async function invokeTool(
  name: string,
  args: Record<string, unknown>,
  ctx?: ToolCtx,
): Promise<ToolInvokeResponse> {
  const r = await fetch(`/v1/agent/tools/${encodeURIComponent(name)}/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ args, ctx: ctx ?? {} }),
  });
  if (!r.ok) {
    return { ok: false, error: `${r.status} ${r.statusText}` };
  }
  return (await r.json()) as ToolInvokeResponse;
}
