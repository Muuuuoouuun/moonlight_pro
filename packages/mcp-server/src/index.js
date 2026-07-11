#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerMoonlightTools } from "./tools.js";

const server = new McpServer({
  name: "moonlight",
  version: "0.1.0",
});

registerMoonlightTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);

process.stderr.write(
  `moonlight-mcp connected (stdio) — hub=${process.env.COM_MOON_HUB_URL || "http://localhost:3000"}, writes=${
    process.env.COM_MOON_HUB_WRITE_SECRET ? "enabled" : "disabled (read-only)"
  }\n`,
);
