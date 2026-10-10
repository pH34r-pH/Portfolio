import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { createInferenceRun } from "../site/assets/model-topology.js";
import { decodeWeights, forwardBytes, sampleByte, seededRandom } from "../site/assets/model-inference.js";

export async function recordHomepageRun(assets) {
  const manifest = JSON.parse(await readFile(join(assets, "lm/manifest.json"), "utf8"));
  const weights = await readFile(join(assets, "lm/unit-hypersphere.f32"));
  if (createHash("sha256").update(weights).digest("hex") !== manifest.sha256) throw new Error("Trained tensor checksum mismatch");
  const model = decodeWeights(manifest, weights.buffer.slice(weights.byteOffset, weights.byteOffset + weights.byteLength));
  const prompt = "the model learned a useful distinction",
    run = createInferenceRun(prompt);
  const bytes = Array.from(new TextEncoder().encode(prompt)),
    emitted = [],
    random = seededRandom(17);
  for (let token = 0; token < 12; token++) {
    const inference = forwardBytes(bytes, model),
      byte = sampleByte(inference.logits, 0.8, random),
      previous = emitted.map((x) => x.toString(16).padStart(2, "0"));
    emitted.push(byte);
    bytes.push(byte);
    run.observations.push(...inference.observations.map((item) => ({ ...item, token, emitted: item.layer === 7 ? emitted.map((x) => x.toString(16).padStart(2, "0")) : previous })));
  }
  return { run, manifest, emitted, prompt };
}
