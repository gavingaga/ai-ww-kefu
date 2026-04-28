# services/upload-svc

对象存储直传 — STS 凭证 / MIME 白名单 / 大小限制 / 病毒扫描钩子。

## 端点

```
POST /v1/upload/sts        {filename, content_type, size}     申请直传凭证
POST /v1/upload/finalize   {upload_id, checksum?, size?}      上传完成回调
GET  /v1/upload/{id}                                          查询记录
GET  /v1/upload/healthz
```

`POST /v1/upload/sts` 返回:

```jsonc
{
  "upload_id": "upl_xxx",
  "object_key": "kefu/<ts>/upl_xxx",
  "url": "https://cdn.example.com/uploads/...",
  "expires_in": 600,
  "sts": {
    "provider": "mock",                   // 生产替换为 oss / s3
    "access_key_id": "...",
    "access_key_secret": "...",
    "security_token": "...",
    "expiration": "2026-04-28T10:00:00Z",
    "bucket": "ai-kefu-prod",
    "region": "oss-cn-hangzhou",
    "post_policy": { "max_bytes": 52428800, "allowed_types": [...] }
  }
}
```

## 校验

- `content_type` 必须在 `aikefu.upload.allowed-types` 白名单
- `size` 不得超过 `aikefu.upload.max-bytes`(默认 50MB)
- `finalize` 阶段实际 `size` 也校验,超限时记录变 `failed`

## 端口

默认 `8088`;`UPLOAD_PORT` 覆盖。

## 后续

- 替换 mock STS 为真 OSS/S3 STS 签名
- 接 `aikefu.upload.av-webhook`(腾讯云 / 阿里云 / VirusTotal),异步把 `status`
  从 `scanning` → `clean` / `infected`
- 持久化:接 Mongo / MySQL,记录上传 + 扫描结果(目前内存)

