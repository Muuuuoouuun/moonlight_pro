import {createAgentHttpHandler} from "@/lib/agent/http.js";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const GET=createAgentHttpHandler("capabilities");
