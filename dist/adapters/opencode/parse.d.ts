/** provider.<id> 中的自定义 Provider。 */
export interface OcProvider {
    name: string;
    baseUrl?: string;
    /** apiKey 是否为明文字面量（非 {env:...} / {file:...} 引用）。 */
    plaintextKey: boolean;
}
/** mcp.<name> 中的 MCP Server。 */
export interface OcMcpServer {
    name: string;
    type?: string;
    /** local 型的启动命令（command 数组首项）。 */
    command?: string;
    /** remote 型的 URL。 */
    url?: string;
    enabled: boolean;
    /** environment / headers 的键名（不含值）。 */
    envKeys: string[];
}
export interface OcData {
    configParsed: boolean;
    providers: OcProvider[];
    mcpServers: OcMcpServer[];
    /** permission.bash（"allow" | "ask" | "deny" 或对象）。 */
    permissionBash?: string;
    /** permission.edit。 */
    permissionEdit?: string;
    /** permission 为顶层 "allow" 或全部子项 allow。 */
    permissionWildcard: boolean;
    /** autoupdate 的显式取值（未配置为 undefined，避免对默认值报噪）。 */
    autoupdate?: boolean;
    /** share 模式："auto" | "manual" | "disabled"。 */
    share?: string;
}
export declare function looksLikeSecretEnv(key: string): boolean;
/**
 * 读取并归一化 OpenCode 配置。
 * @param configPath opencode.json 路径（discover 已判定存在）。
 */
export declare function parseOpenCode(configPath: string): OcData;
