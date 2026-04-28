package com.aikefu.notify.faq.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FaqAttachment {
  /** image / file / link */
  private String type;
  private String url;
}
