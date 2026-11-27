# Offline narration with Kokoro (kokoro-onnx), run with the venv python that already lives on the testbench:
#   ~/video/.venv/bin/python vo.py     (models are read in place from ~/video/models, nothing is installed or modified)
import json, os
import soundfile as sf
from kokoro_onnx import Kokoro
N = json.load(open("narration.json"))
k = Kokoro("/home/USER/video/models/kokoro-v1.0.onnx", "/home/USER/video/models/voices-v1.0.bin")
os.makedirs("out/vo", exist_ok=True)
dur = {}
for s in N["shots"]:
    for i, it in enumerate(s["items"]):
        key = f"{s['id']}_{i}"
        samples, sr = k.create(it["text"], voice=N["voice"], speed=N["speed"], lang="en-us")
        sf.write(f"out/vo/{key}.wav", samples, sr)
        dur[key] = round(len(samples) / sr, 3)
json.dump(dur, open("out/vo/durations.json", "w"), indent=1)
print(len(dur), "clips", round(sum(dur.values()), 1), "s of speech;", sum(len(i["text"].split()) for s in N["shots"] for i in s["items"]), "words")
