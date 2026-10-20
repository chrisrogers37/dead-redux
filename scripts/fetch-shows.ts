import { join } from "path";
import { refreshCatalog } from "./refresh-catalog";

// UTC's date runs ahead of the site's, which only makes the first-repeat check stricter.
const today = new Date().toISOString().split("T")[0];

refreshCatalog(join(process.cwd(), "data"), today).then(
  (exitCode) => {
    process.exitCode = exitCode;
  },
  (err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  }
);
