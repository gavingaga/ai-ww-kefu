package com.aikefu.notify.faq.domain;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 叶子节点动作按钮。 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FaqAction {
  /** send_text / handoff / open_link / open_form */
  private String type;
  private String label;
  /** 与 type 对应的载荷,例如 send_text 的文案、open_link 的 url。 */
  private String payload;
}
