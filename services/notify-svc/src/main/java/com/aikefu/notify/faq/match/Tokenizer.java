package com.aikefu.notify.faq.match;

import java.util.LinkedHashSet;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 极简中英文分词 — 用于"相似匹配"的 token-overlap 兜底通道。
 *
 * <p>真生产请走 ai-hub 的嵌入服务(BGE-M3 / OpenAI text-embedding-3-large);
 * 这里仅在嵌入不可用 / 单元测试中保证 ≥ 0.86 阈值的相似匹配可工作。
 */
public final class Tokenizer {

  private static final Pattern WORD = Pattern.compile("[A-Za-z0-9]+");

  private Tokenizer() {}

  /** 中文按字符切分,英文 / 数字按词切分;统一小写 + 去重。 */
  public static Set<String> tokenize(String text) {
    Set<String> out = new LinkedHashSet<>();
    if (text == null || text.isBlank()) return out;

    int i = 0;
    int n = text.length();
    while (i < n) {
      char c = text.charAt(i);
      if (Character.isWhitespace(c) || isPunctuation(c)) {
        i++;
        continue;
      }
      if (isCJK(c)) {
        out.add(String.valueOf(c));
        i++;
        continue;
      }
      // ASCII letter/digit/underscore -> 词
      int j = i;
      while (j < n && isAsciiWordChar(text.charAt(j))) j++;
      if (j > i) {
        String w = text.substring(i, j).toLowerCase();
        out.add(w);
        i = j;
      } else {
        i++;
      }
    }
    // 兜底:若以上都没产出,用正则
    if (out.isEmpty()) {
      var m = WORD.matcher(text);
      while (m.find()) out.add(m.group().toLowerCase());
    }
    return out;
  }

  /** Jaccard 相似度(用于排序),范围 [0,1]。 */
  public static double jaccard(Set<String> a, Set<String> b) {
    if (a.isEmpty() || b.isEmpty()) return 0d;
    int inter = 0;
    Set<String> small = a.size() < b.size() ? a : b;
    Set<String> big = small == a ? b : a;
    for (String t : small) if (big.contains(t)) inter++;
    int union = a.size() + b.size() - inter;
    return union == 0 ? 0d : (double) inter / union;
  }

  /** Overlap 系数 = |A∩B| / min(|A|,|B|),范围 [0,1]。短输入对长 title 更友好。 */
  public static double overlapCoef(Set<String> a, Set<String> b) {
    if (a.isEmpty() || b.isEmpty()) return 0d;
    int inter = 0;
    Set<String> small = a.size() < b.size() ? a : b;
    Set<String> big = small == a ? b : a;
    for (String t : small) if (big.contains(t)) inter++;
    return (double) inter / small.size();
  }

  private static boolean isCJK(char c) {
    return (c >= 0x4E00 && c <= 0x9FFF) // 基本汉字
        || (c >= 0x3400 && c <= 0x4DBF); // 扩展 A
  }

  private static boolean isAsciiWordChar(char c) {
    return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_';
  }

  private static boolean isPunctuation(char c) {
    // 常见中英文标点
    return ",.;:!?()[]{}<>'\"-/、,。;:!?()【】《》「」".indexOf(c) >= 0;
  }
}
