/** CC Switch 代理接管写入 Agent live 配置的公开占位符，不是真实 Provider 凭证。 */
export declare const PROXY_MANAGED_PLACEHOLDER = "PROXY_MANAGED";
/** 面向用户的统一说明，避免把占位符误称为模型或真实密钥。 */
export declare const PROXY_MANAGED_AUTH_LABEL = "PROXY_MANAGED\uFF08CC Switch \u9274\u6743\u5360\u4F4D\u7B26\uFF09";
export declare function isProxyManagedPlaceholder(value: unknown): boolean;
export declare function ccSwitchAppLabel(appType: unknown): string;
