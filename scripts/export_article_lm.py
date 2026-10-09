"""Export a retained trained LM and exact-source forward observations for browsers.

This explicit operator command reads checkpoints; it never trains or runs an
experiment. Only model tensors and non-secret identity metadata are exported.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
import types

import numpy as np
import torch
from torch.nn import functional as F


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--frontend", type=Path, required=True)
    parser.add_argument("--historical-result", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True, help="Pinned DSL source root")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    identity = json.loads((root / "site/assets/model-architecture.json").read_text())
    for name, digest in identity["sourceMembers"].items():
        if sha(args.source / "src/domain_scaling_lab" / name) != digest:
            raise ValueError(f"Frozen source mismatch: {name}")
    # The source's resource import is only used by its experiment instrumentation.
    if sys.platform == "win32":
        sys.modules.setdefault("resource", types.ModuleType("resource"))
    sys.path.insert(0, str(args.source / "src"))
    from domain_scaling_lab.retained_radius_topology import TopologyTransformer
    from domain_scaling_lab.spectral import LearnedSpectrumFrontend, module_state_fingerprint
    from domain_scaling_lab.receivers import freeze_spectral_precomposition_state
    from domain_scaling_lab.log_polar_no_composition import log_polar_features, DEFAULT_CONFIG

    checkpoint = torch.load(args.checkpoint, map_location="cpu", weights_only=True)
    frontend_checkpoint = torch.load(args.frontend, map_location="cpu", weights_only=True)
    historical = json.loads(args.historical_result.read_text())
    condition, seed, step = checkpoint["condition"], checkpoint["seed"], checkpoint["step"]
    if condition != "unit_hypersphere_depth3" or step != 128:
        raise ValueError("The browser export requires the retained trained hypersphere checkpoint")
    matches = [c for c in historical["cells"] if c["condition"] == condition and c["seed"] == seed]
    if len(matches) != 1 or matches[0]["final_model_state_sha256"] != checkpoint["model_state_sha256"]:
        raise ValueError("Checkpoint is not the historical result's exact trained model")
    model = TopologyTransformer(condition).eval()
    model.load_state_dict(checkpoint["model_state_dict"], strict=True)
    if module_state_fingerprint(model) != checkpoint["model_state_sha256"]:
        raise ValueError("Checkpoint tensors do not match their retained fingerprint")
    frontend = LearnedSpectrumFrontend(32, window_length=4).eval()
    frontend.load_state_dict({k.removeprefix("frontend."): v for k, v in frontend_checkpoint["state_dict"].items() if k.startswith("frontend.")}, strict=True)
    rms_values = {float(c["rms_calibration"]["scalar_rms"]) for c in historical["parameter_matched_depth1_anchor_cells"]}
    if len(rms_values) != 1:
        raise ValueError("Frozen input calibration is ambiguous")
    rms = rms_values.pop()
    tensors = dict(model.state_dict())
    tensors.update({"frontend.real.weight": frontend.real.weight, "frontend.imag.weight": frontend.imag.weight})
    chunks, inventory, offset = [], {}, 0
    for name, tensor in tensors.items():
        values = tensor.detach().cpu().contiguous().numpy().astype("<f4")
        if not np.isfinite(values).all():
            raise ValueError(f"Nonfinite tensor: {name}")
        raw = values.tobytes()
        inventory[name] = {"shape": list(values.shape), "offset": offset, "bytes": len(raw)}
        chunks.append(raw)
        offset += len(raw)
    binary = b"".join(chunks)
    out = root / "site/assets/lm"
    out.mkdir(parents=True, exist_ok=True)
    (out / "unit-hypersphere.f32").write_bytes(binary)
    manifest = {
        "schemaVersion": 1, "format": "little-endian-float32", "condition": condition,
        "seed": seed, "trainingSteps": step, "width": 128, "heads": 4, "depth": 3,
        "frontendDimension": 32, "frontendPositionBase": 10000, "scalarRms": rms,
        "contextBytes": 128, "normalizationEpsilon": 1e-5, "geometryEpsilon": 1e-6,
        "logRadiusEpsilon": DEFAULT_CONFIG.log_radius_epsilon,
        "checkpointSha256": sha(args.checkpoint), "trainedStateSha256": checkpoint["model_state_sha256"],
        "frontendCheckpointSha256": sha(args.frontend), "historicalResultSha256": sha(args.historical_result),
        "sourceModuleSha256": identity["sourceMembers"]["retained_radius_topology.py"],
        "sourceCommit": identity["dslSourceCommit"], "bytes": len(binary),
        "sha256": hashlib.sha256(binary).hexdigest(), "tensors": inventory,
        "input": "BOS and causal UTF-8 bytes; frozen current-symbol spectral frontend, log-polar coordinates, fixed RMS",
        "attentionOperatorDisplay": "RMS of each real 32-coordinate attention context; raw weights retained in observations",
        "description": "Trained research byte LM, historical AdamW baseline, seed 17, 128 steps. Small research model, not a chat assistant.",
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    references = []
    torch.set_num_threads(1)
    for text in ["", "the model", "A useful representation", "Résumé ☀"]:
        token_ids = torch.tensor([[0] + [b + 1 for b in text.encode("utf-8")]])
        valid = torch.ones_like(token_ids, dtype=torch.bool)
        with torch.no_grad():
            raw = freeze_spectral_precomposition_state(frontend, token_ids).current_symbols
            polar, _ = log_polar_features(raw, valid & token_ids.ne(0))
            states = polar / rms
            output, details = model._forward_topology(states, valid, collect=True)
            records = []
            for record in details["steps"]:
                before = record["input"]
                layer = model.blocks[0]
                qkv = F.linear(before, layer.self_attn.in_proj_weight, layer.self_attn.in_proj_bias)
                value = qkv.chunk(3, dim=-1)[2].reshape(1, -1, 4, 32).transpose(1, 2)
                contexts = record["attention"]["attention_weights"] @ value
                post = record["attention"]["post_attention"]
                ffn = F.relu(layer.linear1(post))
                vectors = [before[0, -1], qkv[0, -1], contexts[0, :, -1].square().mean(-1).sqrt(), post[0, -1], ffn[0, -1], record["proposal"][0, -1], record["output"][0, -1]]
                records.extend({"pass": record["step"], "layer": i, "values": vector.tolist()} for i, vector in enumerate(vectors))
            records.append({"pass": 3, "layer": 7, "values": output.logits[0, -1].tolist()})
            references.append({"prompt": text, "nextByte": int(output.logits[0, -1].argmax()), "logits": output.logits[0, -1].tolist(), "observations": records})
    (root / "scripts/fixtures/lm-reference.json").write_text(json.dumps({"weightsSha256": manifest["sha256"], "references": references}, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Exported {len(binary):,} bytes; trained state {checkpoint['model_state_sha256']}")


if __name__ == "__main__":
    main()
