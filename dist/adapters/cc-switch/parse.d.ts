/** 归一化后的单个 Provider。 */
export interface CcProvider {
    appType: string;
    name: string;
    isCurrent: boolean;
    inFailoverQueue: boolean;
    category?: string;
    /** 提取到的 base_url（可能没有，如官方 OAuth）。 */
    baseUrl?: string;
    /** 是否检测到明文密钥字段。 */
    keyPresent: boolean;
    /** 密钥指纹（SHA-256 前 12 位），仅用于复用关联；无密钥时 undefined。 */
    keyFingerprint?: string;
}
/** 单个 app 的代理配置。 */
export interface CcProxy {
    appType: string;
    /** 代理服务已开启，且该 Agent 的 live 路由接管也已开启。 */
    enabled: boolean;
    listenAddress: string;
    listenPort: number;
    autoFailover: boolean;
}
export interface CcSwitchData {
    schemaVersion: number;
    /** 已知可深解析的 schema 版本。 */
    schemaKnown: boolean;
    providers: CcProvider[];
    proxies: CcProxy[];
}
/**
 * 读取并归一化 CC Switch SQLite 数据库。
 * 调用方需自行确保 dbPath 存在（discover 已判定）。
 */
export declare function parseCcSwitchDb(dbPath: string): CcSwitchData;
