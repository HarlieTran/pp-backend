import serverlessExpressModule from "@vendia/serverless-express";
import { app } from "./main.js";

/**
 * Lambda adapter — wraps Express `app` for API Gateway v2 (HTTP API).
 */
// @ts-ignore - bypass incorrect type definitions for esm
export const handler = serverlessExpressModule({ app });
