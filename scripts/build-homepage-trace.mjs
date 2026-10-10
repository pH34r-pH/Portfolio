import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { recordHomepageRun } from "./homepage-recorded-run.mjs";
import { fileURLToPath } from "node:url";

const assets = new URL("../site/assets/", import.meta.url);
const { run, manifest, emitted, prompt } = await recordHomepageRun(fileURLToPath(assets));
const values = new Float32Array(run.observations.flatMap((item) => item.values));
const binary = Buffer.from(values.buffer);
let offset = 0;
const observations = run.observations.map(({ pass, layer, token, emitted, values }) => {
  const descriptor = { pass, layer, token, emitted, offset, length: values.length };
  offset += values.length;
  return descriptor;
});
await writeFile(new URL("homepage-model-trace.f32", assets), binary);
await writeFile(
  new URL("homepage-model-trace.json", assets),
  JSON.stringify(
    {
      schemaVersion: 1,
      prompt,
      generatedBytes: emitted,
      trainedStateSha256: manifest.trainedStateSha256,
      weightsSha256: manifest.sha256,
      bytes: binary.length,
      sha256: createHash("sha256").update(binary).digest("hex"),
      durationSeconds: 8.4,
      loopStartSeconds: 1.8,
      observations,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Recorded ${observations.length} real LM observations in ${binary.length} bytes; native display refresh playback.`);
