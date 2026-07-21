## 目标

<!-- 解决什么问题？对应当前哪个阶段或 Issue？ -->

## 变更类型

- [ ] Agent adapter / 配置解析
- [ ] 安全规则 / 处置矩阵
- [ ] baseline / apply / restore
- [ ] CLI / JSON / HTML 报告
- [ ] macOS Desktop / IPC
- [ ] 文档 / 发布基础设施

## 影响面

- [ ] 新增或修改 RuleId、severity、priority、disposition、acceptWhen 或 grouping
- [ ] 修改 schemaVersion、现有 JSON 字段、退出码或 taskId
- [ ] 接触凭证、环境变量、配置内容、路径或 Provider 端点
- [ ] 增加文件写入、备份或恢复行为
- [ ] 修改 Electron 权限、IPC、导航或系统能力
- [ ] 修改对外能力、限制或用户操作步骤
- [ ] 修改 Accepted ADR 定义的长期架构或安全边界

请说明已勾选项的行为变化；没有影响请写“无”：

## 安全与隐私

- [ ] 完整序列化输出不包含测试凭证
- [ ] fixture、截图和文档只使用合成路径、示例域名和占位凭证
- [ ] 写入仍具备预览、确认、备份、原子性、复扫和安全恢复
- [ ] 风险接受或 Provider 信任没有隐藏独立风险
- [ ] Desktop renderer 没有获得任意命令或文件访问能力

## 验证

- [ ] `npm run check`
- [ ] `npm run sanitize:staged`
- [ ] `git diff --check`
- [ ] `npm run desktop:pack`（如涉及桌面端）
- [ ] 已更新相关权威文档或说明不需要更新的原因
- [ ] 已遵守相关 ADR；如改变长期决策，已新增替代 ADR

未运行的验证及原因：
