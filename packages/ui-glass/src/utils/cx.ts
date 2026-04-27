/** 极简 className 拼接。无重量级依赖。 */
export type Cn = string | number | false | null | undefined | Cn[] | { [k: string]: unknown };

export function cx(...args: Cn[]): string {
  const out: string[] = [];
  for (const a of args) {
    if (!a) continue;
    if (typeof a === "string" || typeof a === "number") out.push(String(a));
    else if (Array.isArray(a)) out.push(cx(...a));
    else if (typeof a === "object") {
      for (const [k, v] of Object.entries(a)) if (v) out.push(k);
    }
  }
  return out.join(" ");
}
