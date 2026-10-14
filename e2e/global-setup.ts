import { execSync } from "node:child_process";

/** Fresh demo data for every run (replaces only the demo workspace and users). */
export default function globalSetup() {
  execSync("pnpm db:seed", { stdio: "inherit" });
}
