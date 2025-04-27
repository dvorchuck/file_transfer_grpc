const { writeFileSync } = require("fs");

const REPEAT = 100;
for (let i = 0; i < REPEAT; i++) {
  writeFileSync(
    `storage-server/client-12345/test${i}.txt`,
    "hi".repeat(10_000_000)
  );
}
