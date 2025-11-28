/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

// Simple User type (no longer using database)
export type User = {
  id?: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: "user" | "admin";
  createdAt?: Date;
  updatedAt?: Date;
  lastSignedIn: Date;
};
