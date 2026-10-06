import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { resolveOtpSession } from "../auth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function authenticateUser(req: CreateExpressContextOptions["req"]): Promise<User | null> {
  try {
    const otp = await resolveOtpSession(req);
    // An invalid/revoked independent token must never become a legacy session.
    return otp.handled ? otp.user : await sdk.authenticateRequest(req);
  } catch {
    return null;
  }
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const user = await authenticateUser(opts.req);

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
