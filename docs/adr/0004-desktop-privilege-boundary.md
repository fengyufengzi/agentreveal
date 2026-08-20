# ADR-0004：Electron renderer 保持无权限，业务复用 typed core

- Status: Superseded by ADR-0007 (2026-08-05)
- Date: 2026-07-17

## 背景

桌面端需要选择项目、导出文件、打开报告和应用配置。Electron renderer 同时处理来自本地配置和报告的
展示数据；如果它获得 Node、shell 或任意文件权限，渲染层缺陷会直接扩大为本机代码执行或配置泄漏。

## 决策

1. 桌面业务逻辑通过 `src/desktop/service.ts` 复用 core 和 typed schema，不解析 CLI 文案，也不复制规则实现。
2. renderer 保持 sandbox、contextIsolation，禁用 nodeIntegration，并使用限制严格的 CSP 和导航策略。
3. preload 只暴露命名明确的最小函数；每个函数对应一个白名单 `agentguard:<operation>` IPC。
4. 主进程验证 main frame、枚举、长度、ID、fingerprint、项目授权和路径来源。
5. 项目目录和任意导入/导出路径必须来自原生对话框或主进程签发的当前会话记录，renderer 不能自由指定。
6. 配置写入仍遵守 ADR-0003，并在主进程显示原生确认；renderer 不能绕过预览或确认。
7. 主进程不提供通用 shell、child_process、任意 URL 或任意文件 API。
8. 桌面诊断只记录固定操作、时间、结果和错误分类；诊断失败不得影响主要操作。

## 不可破坏约束

- 新 Desktop 功能必须同步 service、main、preload、renderer、诊断白名单和测试。
- `shell.openPath` 等系统能力只能处理本次会话由 AgentGuard 生成或用户明确选择的路径。
- 任何需要执行修复命令的功能必须实现为受约束的 typed core 操作，不能接受 renderer 传入命令字符串。
- CLI 和 Desktop 对同一项目必须产生相同 taskId、处置和验证结果。

## 影响

- IPC 数量会增加，但每个权限和输入范围都能独立审查。
- renderer 不能直接复用 Node 模块，所有系统交互需要主进程桥接。
- smoke test 和贡献一致性检查会阻止 main/preload 白名单漂移与明显的权限回退。

## 未采用方案

- 在 renderer 启用 Node 以简化开发：任何 XSS 或依赖问题都会获得本机权限。
- 启动 CLI 子进程并解析 stdout：输出文案不是稳定契约，也会扩大命令注入和环境差异风险。
