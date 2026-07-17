/** 一个 Gemini MCP Server。 */
export interface GeminiMcpServer {
    name: string;
    /** stdio 启动命令（若配置）。 */
    command?: string;
    /** 远程端点：url ?? httpUrl（若配置）。 */
    url?: string;
    /** trust === true：绕过该 server 全部工具调用确认（等价 per-server YOLO）。 */
    trust: boolean;
    /** env 键名（不含值）。 */
    envKeys: string[];
    /** headers 键名（不含值）。 */
    headerKeys: string[];
}
export interface GeminiData {
    /** settings.json 是否成功解析。 */
    settingsParsed: boolean;
    /** security.auth.selectedType，如 oauth-personal / gemini-api-key / vertex-ai。 */
    authType?: string;
    mcpServers: GeminiMcpServer[];
    /** mcp.excluded 全局排除清单（仅用于说明，不直接报风险）。 */
    mcpExcluded: string[];
    /** tools.sandbox（可为字符串镜像名或布尔）。 */
    sandbox?: string | boolean;
    /**
     * 是否显式启用 shell 工具：coreTools 显式列出 run_shell_command，
     * 且未被 excludeTools 屏蔽。
     * 注：默认（coreTools 未设）虽也放开 shell，但为避免对每个默认安装误报，
     * 此处只在用户显式 allowlist 声明时才判为 true。
     */
    shellToolAllowed: boolean;
    /** ~/.gemini/.env 中 value 非空且非 ${VAR} 引用的键名（只存键名，不存值）。 */
    plaintextEnvKeys: string[];
}
export declare function looksLikeSecretEnv(key: string): boolean;
/**
 * 读取并归一化 Gemini CLI 配置。
 * @param settingsPath ~/.gemini/settings.json 路径。
 * @param configDir 配置目录（用于定位 .env）。
 */
export declare function parseGemini(settingsPath: string, configDir: string): GeminiData;
