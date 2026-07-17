/** map 命令的终端输出格式化（对齐表格，纯字符串，便于测试/复用）。 */
import type { ConfigMap } from "../map/index.js";
/** 生成完整 map 文本报告。 */
export declare function formatMap(map: ConfigMap): string;
