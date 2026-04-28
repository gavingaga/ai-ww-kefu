package com.aikefu.upload.web;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.aikefu.upload.domain.UploadRecord;
import com.aikefu.upload.service.UploadService;

@RestController
@RequestMapping("/v1/upload")
public class UploadController {

  private final UploadService svc;

  public UploadController(UploadService svc) {
    this.svc = svc;
  }

  @GetMapping("/healthz")
  public Map<String, Object> healthz() {
    return Map.of(
        "status", "ok",
        "size", svc.size(),
        "max_bytes", svc.maxBytes(),
        "allowed_types", svc.allowedTypes());
  }

  /** 申请直传凭证。 */
  @PostMapping("/sts")
  public ResponseEntity<Map<String, Object>> sts(@RequestBody Map<String, Object> body) {
    String filename = String.valueOf(body.getOrDefault("filename", "unnamed"));
    String contentType = String.valueOf(body.getOrDefault("content_type", ""));
    long size = numAsLong(body.get("size"), 0L);
    try {
      return ResponseEntity.ok(svc.issueStsCredential(filename, contentType, size));
    } catch (IllegalArgumentException e) {
      return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
    }
  }

  /** 直传完成回调。 */
  @PostMapping("/finalize")
  public ResponseEntity<UploadRecord> finalize(@RequestBody Map<String, Object> body) {
    String id = String.valueOf(body.getOrDefault("upload_id", ""));
    if (id.isBlank()) return ResponseEntity.badRequest().build();
    String checksum = body.get("checksum") == null ? null : String.valueOf(body.get("checksum"));
    Long size = body.get("size") == null ? null : numAsLong(body.get("size"), 0L);
    try {
      return ResponseEntity.ok(svc.finalize(id, checksum, size));
    } catch (IllegalArgumentException e) {
      return ResponseEntity.badRequest().build();
    }
  }

  @GetMapping("/{id}")
  public ResponseEntity<UploadRecord> get(@PathVariable("id") String id) {
    UploadRecord r = svc.get(id);
    return r == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(r);
  }

  private static long numAsLong(Object v, long def) {
    if (v instanceof Number n) return n.longValue();
    if (v == null) return def;
    try {
      return Long.parseLong(String.valueOf(v));
    } catch (NumberFormatException e) {
      return def;
    }
  }
}
