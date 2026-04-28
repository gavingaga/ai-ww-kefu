package com.aikefu.upload.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;

import org.junit.jupiter.api.Test;

class UploadServiceTest {

  private UploadService newSvc() {
    return new UploadService(
        600,
        1_000_000L,
        "image/png,image/jpeg,application/pdf",
        "https://cdn.example.com/uploads");
  }

  @Test
  void issuesStsForAllowedType() {
    UploadService s = newSvc();
    Map<String, Object> r = s.issueStsCredential("a.png", "image/png", 200_000L);
    assertThat(r.get("upload_id")).asString().startsWith("upl_");
    assertThat(r.get("url")).asString().startsWith("https://cdn.example.com/uploads/");
    Map<?, ?> sts = (Map<?, ?>) r.get("sts");
    assertThat(sts.get("provider")).isEqualTo("mock");
    assertThat(sts.get("expiration")).isNotNull();
  }

  @Test
  void rejectsDisallowedContentType() {
    UploadService s = newSvc();
    assertThatThrownBy(() -> s.issueStsCredential("x.exe", "application/x-msdownload", 100))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("content_type not allowed");
  }

  @Test
  void rejectsOversize() {
    UploadService s = newSvc();
    assertThatThrownBy(() -> s.issueStsCredential("big.pdf", "application/pdf", 5_000_000L))
        .hasMessageContaining("exceeds max");
  }

  @Test
  void finalizeMarksCleanAndStoresChecksum() {
    UploadService s = newSvc();
    String id = (String) s.issueStsCredential("a.png", "image/png", 100_000L).get("upload_id");
    var rec = s.finalize(id, "sha256:abc", 99_900L);
    assertThat(rec.getStatus()).isEqualTo("clean");
    assertThat(rec.getChecksum()).isEqualTo("sha256:abc");
    assertThat(rec.getSize()).isEqualTo(99_900L);
    assertThat(rec.getFinalizedAt()).isNotNull();
  }

  @Test
  void finalizeRejectsOversize() {
    UploadService s = newSvc();
    String id = (String) s.issueStsCredential("a.png", "image/png", 100_000L).get("upload_id");
    assertThatThrownBy(() -> s.finalize(id, "sha", 2_000_000L))
        .hasMessageContaining("exceeds limit");
    assertThat(s.get(id).getStatus()).isEqualTo("failed");
  }

  @Test
  void getReturnsNullForUnknownId() {
    assertThat(newSvc().get("nope")).isNull();
  }
}
