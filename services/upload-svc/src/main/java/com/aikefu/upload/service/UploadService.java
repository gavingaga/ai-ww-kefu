package com.aikefu.upload.service;

import java.time.Instant;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.aikefu.upload.domain.UploadRecord;

/**
 * 上传服务 — M3 起步内存元数据 + mock STS。生产前替换:
 *
 * <ul>
 *   <li>STS:接 OSS/STS / S3 STS,签名真凭证
 *   <li>病毒扫描:把 av-webhook 配上腾讯云 / 阿里云 / VirusTotal 回调
 *   <li>持久化:接 Mongo / Mysql,记录上传 & 扫描结果
 * </ul>
 */
@Service
public class UploadService {

  private final long stsTtlSeconds;
  private final long maxBytes;
  private final Set<String> allowedTypes;
  private final String publicBase;
  private final Map<String, UploadRecord> records = new ConcurrentHashMap<>();

  public UploadService(
      @Value("${aikefu.upload.sts-ttl-seconds:600}") long stsTtlSeconds,
      @Value("${aikefu.upload.max-bytes:52428800}") long maxBytes,
      @Value("${aikefu.upload.allowed-types:image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,video/mp4}")
          String allowedTypesCsv,
      @Value("${aikefu.upload.public-base:https://cdn.example.com/uploads}") String publicBase) {
    this.stsTtlSeconds = stsTtlSeconds;
    this.maxBytes = maxBytes;
    this.allowedTypes =
        new HashSet<>(
            Arrays.stream(allowedTypesCsv.split(","))
                .map(String::trim)
                .filter(s -> !s.isBlank())
                .toList());
    this.publicBase = publicBase.endsWith("/") ? publicBase.substring(0, publicBase.length() - 1) : publicBase;
  }

  public Map<String, Object> issueStsCredential(
      String filename, String contentType, long size) {
    validate(contentType, size);
    String id = "upl_" + UUID.randomUUID().toString().replace("-", "");
    String objectKey = "kefu/" + Instant.now().toEpochMilli() + "/" + id;
    String url = publicBase + "/" + objectKey;
    UploadRecord r =
        UploadRecord.builder()
            .id(id)
            .filename(filename)
            .contentType(contentType)
            .size(size)
            .status("pending")
            .url(url)
            .createdAt(Instant.now())
            .build();
    records.put(id, r);

    Map<String, Object> resp = new LinkedHashMap<>();
    resp.put("upload_id", id);
    resp.put("object_key", objectKey);
    resp.put("url", url);
    resp.put("expires_in", stsTtlSeconds);
    // mock STS 凭证 — 真实接 OSS 时替换为签名版
    Map<String, Object> sts = new LinkedHashMap<>();
    sts.put("provider", "mock");
    sts.put("access_key_id", "MOCK-AK-" + id.substring(0, 6));
    sts.put("access_key_secret", "MOCK-SK");
    sts.put("security_token", "MOCK-TOKEN-" + id);
    sts.put("expiration", Instant.now().plusSeconds(stsTtlSeconds).toString());
    sts.put("bucket", "ai-kefu-prod");
    sts.put("region", "oss-cn-hangzhou");
    sts.put(
        "post_policy",
        Map.of(
            "max_bytes", maxBytes,
            "allowed_types", allowedTypes));
    resp.put("sts", sts);
    return resp;
  }

  /**
   * 客户端直传完成回调 — 校验白名单 + 触发(mock)病毒扫描 + 标记状态。
   */
  public UploadRecord finalize(String uploadId, String checksum, Long actualSize) {
    UploadRecord r = records.get(uploadId);
    if (r == null) throw new IllegalArgumentException("upload not found: " + uploadId);
    if (actualSize != null && actualSize > maxBytes) {
      r.setStatus("failed");
      r.setFinalizedAt(Instant.now());
      throw new IllegalArgumentException(
          "size " + actualSize + " exceeds limit " + maxBytes);
    }
    if (actualSize != null) r.setSize(actualSize);
    r.setChecksum(checksum);
    r.setStatus("scanning");
    r.setFinalizedAt(Instant.now());
    // mock 扫描:即同步标记 clean;真接 av-webhook 时,这里会异步走
    r.setStatus("clean");
    return r;
  }

  public UploadRecord get(String id) {
    return records.get(id);
  }

  public int size() {
    return records.size();
  }

  public Set<String> allowedTypes() {
    return Set.copyOf(allowedTypes);
  }

  public long maxBytes() {
    return maxBytes;
  }

  private void validate(String contentType, long size) {
    if (contentType == null || contentType.isBlank()) {
      throw new IllegalArgumentException("content_type required");
    }
    if (!allowedTypes.contains(contentType)) {
      throw new IllegalArgumentException(
          "content_type not allowed: " + contentType + " (allowed=" + allowedTypes + ")");
    }
    if (size <= 0) {
      throw new IllegalArgumentException("size must be > 0");
    }
    if (size > maxBytes) {
      throw new IllegalArgumentException(
          "size " + size + " exceeds max " + maxBytes);
    }
  }
}
