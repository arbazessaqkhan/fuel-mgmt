import { readFileSync } from "fs";
import { multipassRecognize } from "../src/lib/ocr/multipass-engine";

const src = process.argv[2] ?? "/workspace/userDocs/image_39ae5479.png";
const buf = readFileSync(src);
multipassRecognize(buf, (p) => {
  if (p % 20 === 0) console.log("progress", p);
})
  .then((r) => {
    console.log(JSON.stringify(r, null, 1));
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
