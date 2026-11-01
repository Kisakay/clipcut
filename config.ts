import { homedir, userInfo } from "node:os";
import { join } from "node:path";

// ─── Config ───────────────────────────────────────────────────────────────────
export const USERNAME = userInfo().username;
export const HOME_DIR = homedir();
export const RECORDS_DIR = join(HOME_DIR, "Videos");
