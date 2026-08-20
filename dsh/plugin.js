/** AgentReveal slash command bundle for @deepseek-ai/dsh 0.1.0-rc.7. */
import { runDshAgentRevealCommand } from "../dist/integrations/dsh-adapter.js";

export const name = "agentreveal-command";
export const inject = ["commands"];

/**
 * Register a local-only command. DSH executes registered slash commands directly;
 * the input and result are not sent to the model as a prompt.
 */
export function apply(ctx) {
  if (!ctx?.commands || typeof ctx.commands.register !== "function") {
    throw new Error(
      "AgentReveal requires @deepseek-ai/dsh 0.1.0-rc.7 command registry."
    );
  }
  ctx.commands.register({
    name: "agentreveal",
    description: "run a local read-only AgentReveal security check",
    recordInput: false,
    handler: (invocation) =>
      runDshAgentRevealCommand({
        rawInput: invocation.rawInput,
        signal: invocation.signal,
        cwd: process.cwd(),
      }),
  });
}
