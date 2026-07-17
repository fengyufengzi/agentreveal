export interface OcGateway {
    port?: number;
    mode?: string;
    bind?: string;
    /** 鉴权配置（明文 token 在这里，evidence 不返回原值）。 */
    auth?: {
        token?: string;
        password?: string;
    };
    /** Tailscale/funnel 等暴露方式。 */
    tailscale?: {
        mode?: string;
        hostname?: string;
    } | boolean;
}
export interface OcChannelSecret {
    channel: string;
    /** 是否检测到明文 secret（不返回值）。 */
    hasAppSecret: boolean;
    /** 是否检测到明文 token / verification token。 */
    hasToken: boolean;
}
export interface OcPlugin {
    name: string;
    source?: string;
    enabled?: boolean;
}
export interface OcAgentEntry {
    id: string;
    name?: string;
    workspace?: string;
    agentDir?: string;
}
export interface OcData {
    configFound: boolean;
    configPath?: string;
    meta?: {
        lastTouchedVersion?: string;
        lastTouchedAt?: string;
    };
    gateway?: OcGateway;
    /** 渠道清单及其 secret 存在性（不返回 secret 内容）。 */
    channels: OcChannelSecret[];
    /** 插件清单（只读 name/source/enabled）。 */
    plugins: OcPlugin[];
    /** Agent 列表（id/name/workspace 路径）。 */
    agents: OcAgentEntry[];
    /** 是否配置了 service-env（gateway env 文件存在）。 */
    serviceEnvPresent: boolean;
}
/**
 * 安全探测 OpenClaw 配置：捕获所有解析错误并降级。
 * evidence 仅含结构信息（字段名/路径/计数），绝不含 secret 值。
 */
export declare function parseOpenClaw(configPath: string | undefined, homeDir: string, serviceEnvDir?: string): {
    ok: true;
    data: OcData;
} | {
    ok: false;
    reason: string;
};
