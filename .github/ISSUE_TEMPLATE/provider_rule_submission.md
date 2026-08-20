---
name: 🆕 新增 Provider 规则
about: 提交新的模型 Provider / 中转 API / 国内大模型识别规则
title: "[Provider] "
labels: ["provider-rules", "community-contribution"]
assignees: []
---

## Provider 基本信息

- **名称**: <!-- 例如：DeepSeek、MiniMax、通义千问 -->
- **类型**:
  - [ ] 官方地址 (`official`)
  - [ ] 国内官方 (`domestic_official`)
  - [ ] 企业内网 (`enterprise_internal`)
  - [ ] 中转 API (`relay_or_proxy`)
  - [ ] OpenAI Compatible (`openai_compatible`)
  - [ ] 本地模型 (`local`)
- **服务商主页**: <!-- https://example.com -->

## 识别规则

请提供匹配 `base_url` 的规则（支持正则或前缀）：

```yaml
# 示例
providers:
  - name: deepseek
    display_name: DeepSeek
    type: domestic_official
    base_url_patterns:
      - "^https://api\\.deepseek\\.com"
      - "^https://api\\.deepseek\\.com/v1$"
    default_trust_level: trusted
    docs: https://platform.deepseek.com/api-docs/
    region: cn
```

## 建议的默认信任等级

- [ ] `trusted` — 已知官方地址
- [ ] `internal` — 企业内部服务
- [ ] `unknown` — 待用户确认
- [ ] `untrusted` — 已知不可信

## 风险备注

<!-- 该 Provider 在 AgentReveal 中应该提示什么风险？例如：海外服务可能跨境传输、共享密钥风险等 -->

## 测试用例

<!-- 至少 1 个 base_url 示例 + 你期望的识别结果 -->

```yaml
test_cases:
  - input: https://api.deepseek.com/v1
    expected_provider: deepseek
    expected_trust_level: trusted
    expected_risk: low
```

## 证据来源

<!-- 这个 Provider 规则基于哪些来源？请提供官方文档、API 文档、博客等链接 -->

## 是否愿意贡献

- [ ] 我可以提 PR 直接添加规则
- [ ] 我可以补充测试用例
- [ ] 仅建议规则

---

> 💡 **小贴士**：所有 Provider 规则 PR 都会被自动跑回归测试。请确保提供至少 1 个正例和 1 个反例的测试用例。
