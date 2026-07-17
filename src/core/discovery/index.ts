/** discovery 编排：运行所有 adapter 的 discover()，汇总结果。 */
import { homedir } from "node:os";
import type { AgentDiscovery, DiscoveryContext } from "../../adapters/types.js";
import { adapters } from "../../adapters/index.js";

/** 从当前进程构建 discovery 上下文。 */
export function buildContext(): DiscoveryContext {
  return {
    home: homedir(),
    cwd: process.cwd(),
    env: process.env,
  };
}

/**
 * 运行全部 adapter 的 discovery。
 * 单个 adapter 抛错不影响其他（对应 Spike 模块 B：缺失/异常不报错）。
 */
export async function discoverAll(
  ctx: DiscoveryContext = buildContext()
): Promise<AgentDiscovery[]> {
  const results = await Promise.all(
    adapters.map(async (a): Promise<AgentDiscovery> => {
      try {
        return await a.discover(ctx);
      } catch {
        return {
          agent: a.agent,
          displayName: a.displayName,
          configFound: false,
          notes: ["discovery 过程出错，已跳过"],
        };
      }
    })
  );
  return results;
}
