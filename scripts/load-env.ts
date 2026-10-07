// Scripts load .env.local first, then .env (dotenv never overrides an already-set key).
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
