/** [model_providers.*] 中的一个自定义 Provider。 */
export interface CodexModelProvider {
    name: string;
    baseUrl?: string;
    wireApi?: string;
    /** 引用的环境变量名（非值）。 */
    envKey?: string;
}
/** [mcp_servers.*] 中的一个 MCP Server。 */
export interface CodexMcpServer {
    name: string;
    type?: string;
    command?: string;
    /** 远程 MCP 的 URL（若为 SSE/HTTP 型）。 */
    url?: string;
    enabled: boolean;
    /** env 的键名列表（不含值），用于识别内嵌密钥。 */
    envKeys: string[];
}
export interface CodexData {
    /** 主配置是否成功解析。 */
    configParsed: boolean;
    /** 解析失败时的固定安全原因，不含底层异常原文。 */
    parseFailureReason?: string;
    providers: CodexModelProvider[];
    /** 顶层 model_provider（当前激活的自定义 provider 名）。 */
    activeProvider?: string;
    mcpServers: CodexMcpServer[];
    /** trust_level = "trusted" 的项目路径。 */
    trustedProjects: string[];
    /** [network].proxy_url。 */
    proxyUrl?: string;
    /** auth.json 中是否存在非空 OPENAI_API_KEY（原始密钥落盘）。 */
    apiKeyPresent: boolean;
    /** auth.json 是否含 CC Switch 写入的非秘密接管占位符。 */
    proxyManagedPlaceholderPresent: boolean;
    /** auth.json 的 auth_mode（如 "chatgpt" / "apikey"）。 */
    authMode?: string;
}
/** 判断某 env 键名是否疑似密钥。 */
export declare function looksLikeSecretEnv(key: string): boolean;
/**
 * 读取并归一化 Codex 配置。
 * @param configPath config.toml 路径（discover 已判定存在）。
 * @param baseDir 配置目录（用于定位 auth.json）。
 */
export declare function parseCodex(configPath: string, baseDir: string): CodexData;
