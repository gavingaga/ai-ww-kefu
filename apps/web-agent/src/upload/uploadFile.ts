/**
 * C 端文件上传 — 三步走:
 *
 * 1. POST /v1/upload/sts {filename, content_type, size} → 拿到 upload_id + url + sts
 * 2. 直传(当前 mock 模式只能"假装"上传 — 真实接 OSS 后会用 sts 签名 PUT)
 * 3. POST /v1/upload/finalize {upload_id, size}
 *
 * 失败时抛 Error,呼叫方更新 message.error。
 */

export interface StsResponse {
  upload_id: string;
  object_key: string;
  url: string;
  expires_in: number;
  sts: Record<string, unknown>;
}

export interface FinalizeResponse {
  id: string;
  url: string;
  status: string;
  contentType: string;
  size: number;
}

export async function requestSts(
  filename: string,
  contentType: string,
  size: number,
): Promise<StsResponse> {
  const r = await fetch("/v1/upload/sts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filename, content_type: contentType, size }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`sts ${r.status}: ${text}`);
  }
  return (await r.json()) as StsResponse;
}

export async function finalize(uploadId: string, size: number): Promise<FinalizeResponse> {
  const r = await fetch("/v1/upload/finalize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ upload_id: uploadId, size }),
  });
  if (!r.ok) throw new Error(`finalize ${r.status}`);
  return (await r.json()) as FinalizeResponse;
}

/**
 * 真实直传(M3 mock):浏览器拿到 sts 后,会用预签名 URL PUT 文件;
 * 这里仅做"假装上传 + 进度回调"以便 UI 跑通。
 *
 * 生产替换为 OSS / S3 SDK 的 multipart/PUT,onProgress 透传。
 */
export async function fakeDirectUpload(
  _file: File,
  onProgress: (p: number) => void,
): Promise<void> {
  // 模拟分段进度
  for (let p = 10; p < 100; p += 15) {
    await new Promise((res) => setTimeout(res, 80));
    onProgress(p);
  }
  onProgress(100);
}

export async function uploadFile(
  file: File,
  onProgress: (p: number) => void,
): Promise<FinalizeResponse> {
  const sts = await requestSts(file.name, file.type || "application/octet-stream", file.size);
  await fakeDirectUpload(file, onProgress);
  return await finalize(sts.upload_id, file.size);
}

export const MAX_BYTES = 50 * 1024 * 1024;
export const ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "video/mp4",
]);

export function preflight(file: File): string | null {
  if (file.size > MAX_BYTES) return `文件太大(${(file.size / 1024 / 1024).toFixed(1)} MB > 50 MB)`;
  if (file.type && !ALLOWED.has(file.type)) return `类型 ${file.type} 不允许`;
  return null;
}
