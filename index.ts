import type { OpenClawApi } from "openclaw";
import { outbound } from "./src/channel.js";

// Feishu channel plugin for OpenClaw
export default function registerFeishuPlugin(api: OpenClawApi) {
  api.registerChannel({
    plugin: {
      id: "feishu",
      meta: {
        id: "feishu",
        label: "Feishu/Lark",
        selectionLabel: "Feishu/Lark (飞书)",
        docsPath: "/channels/feishu",
        blurb: "飞书/Lark messaging channel for OpenClaw",
        aliases: ["lark"],
      },
      capabilities: {
        chatTypes: ["direct", "group"],
        media: {
          images: true,
          files: true,
        },
        reactions: false,
        threads: false,
        mentions: true,
        replyContext: true,
      },
      config: {
        listAccountIds: (cfg) =>
          Object.keys(cfg.channels?.feishu?.accounts ?? {}),
        resolveAccount: (cfg, accountId) =>
          cfg.channels?.feishu?.accounts?.[accountId ?? "default"] ?? {
            accountId: accountId ?? "default",
          },
      },
      outbound,
    },
  });
}
