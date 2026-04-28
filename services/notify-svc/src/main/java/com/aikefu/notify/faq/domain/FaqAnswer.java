package com.aikefu.notify.faq.domain;

import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 叶子节点的预设答案。 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FaqAnswer {
  /** 答案文本(支持 Markdown 子集)。 */
  private String contentMd;
  /** 附件:image / file / link 等。 */
  private List<FaqAttachment> attachments;
  /** 同级延伸问题(指向其它叶子的 id + title 摘要)。 */
  private List<FaqFollowUp> followUps;
  /** 答案下方的动作按钮。 */
  private List<FaqAction> actions;
}
