package com.aikefu.upload.domain;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonInclude;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class UploadRecord {
  private String id;
  private String filename;
  private String contentType;
  private long size;
  private String checksum;
  /** pending / scanning / clean / infected / failed */
  private String status;
  private String url;
  private Instant createdAt;
  private Instant finalizedAt;
}
