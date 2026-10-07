import "./load-env";
import { scheduleMarkdown } from "../lib/format";
import { pool } from "../lib/db";

// Prints get_schedule output (default doctor, range from argv) for checkpoint verification.
scheduleMarkdown({ range: (process.argv[2] as "today" | "tomorrow" | "this_week" | "next_7_days") ?? "this_week" })
  .then((md) => console.log(md))
  .finally(() => pool().end());
