// Boot an isolated in-memory MongoDB and print its URI, so the API matrix
// never touches the real Atlas cluster in server/.env.
import { MongoMemoryServer } from "mongodb-memory-server";
import { writeFileSync } from "node:fs";

const mem = await MongoMemoryServer.create({ instance: { port: 27018 } });
writeFileSync("/private/tmp/claude-501/-Users-ilish-acc-Developer-floodMarking2/ccf3231c-ae24-46d5-89fd-83a2a20b0ce5/scratchpad/mem-uri.txt", mem.getUri());
console.log("MEM_URI", mem.getUri());
process.on("SIGTERM", async () => { await mem.stop(); process.exit(0); });
setInterval(() => {}, 1 << 30);
