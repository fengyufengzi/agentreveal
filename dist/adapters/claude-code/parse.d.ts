/** 一个 MCP Server（全局或项目级）。 */
export interface ClaudeMcpServer {
    name: string;
    scope: "global" | "project";
    type?: string;
    command?: string;
    url?: string;
    /** env 键名（不含值）。 */
    envKeys: string[];
}
export interface ClaudeData {
    /** settings.json 是否成功解析。 */
    settingsFound: boolean;
    /** ANTHROPIC_BASE_URL（若配置）。 */
    baseUrl?: string;
    /** env 中是否存在明文 ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY。 */
    authTokenPresent: boolean;
    /** 是否存在 CC Switch 代理接管写入的非秘密占位符。 */
    proxyManagedPlaceholderPresent: boolean;
    /** 是否配置了 apiKeyHelper（外部命令产出密钥）。 */
    apiKeyHelperPresent: boolean;
    /** permissions.allow 规则。 */
    permissionAllowRules: string[];
    /** permissions.defaultMode。 */
    defaultMode?: string;
    /** defaultMode === "bypassPermissions"。 */
    bypassPermissions: boolean;
    /** 是否配置了 hooks（执行任意 shell 命令）。 */
    hooksPresent: boolean;
    /** enableAllProjectMcpServers。 */
    enableAllProjectMcp: boolean;
    mcpServers: ClaudeMcpServer[];
}
export declare function looksLikeSecretEnv(key: string): boolean;
/**
 * 返回实际包含 Claude 明文字段的设置文件路径，不返回字段值。
 * Desktop 备份流程据此限定目标，避免复制无关配置。
 */
export declare function claudePlaintextSettingsFiles(configDir: string): string[];
/**
 * 读取并归一化 Claude Code 配置。
 * @param configDir 主配置目录（~/.claude 或 CLAUDE_CONFIG_DIR）。
 * @param home 用户主目录（用于定位 ~/.claude.json 全局状态）。
 */
export declare function parseClaudeCode(configDir: string, home: string): ClaudeData;
