// Simplified SDK without OAuth and database dependencies
import type { Request } from "express";
import type { User } from "@shared/types";

// Simple user type for non-authenticated mode
const DEFAULT_USER: User = {
  openId: "guest",
  name: "Guest",
  email: null,
  loginMethod: null,
  lastSignedIn: new Date(),
  role: "user",
} as User;

class SDKServer {
  /**
   * Simplified authentication - returns a default guest user
   * Since we're not using OAuth, all requests are treated as guest users
   */
  async authenticateRequest(_req: Request): Promise<User> {
    // Return a default guest user for all requests
    return DEFAULT_USER;
  }
}

export const sdk = new SDKServer();
