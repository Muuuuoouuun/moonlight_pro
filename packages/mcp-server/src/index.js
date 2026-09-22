#!/usr/bin/env node
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {createMoonlightServer,version} from './server.js';
const profile=process.env.COM_MOON_MCP_PROFILE||'core';
const readOnly=process.env.COM_MOON_MCP_READ_ONLY==='1';
const {server,names}=createMoonlightServer({profile,mode:process.env.COM_MOON_MCP_API_MODE||'auto',readOnly});
await server.connect(new StdioServerTransport());
process.stderr.write(`moonlight-mcp ${version} (stdio) — profile=${profile}${readOnly?' read-only':''}, tools=${names.length}\n`);
