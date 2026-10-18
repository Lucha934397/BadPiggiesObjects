#!/usr/bin/env bash
set -euo pipefail

# Patch the generated binding immediately before C++ compilation. Codegen runs
# again during the build, so a configure-time patch alone is overwritten.
compiler="$1"
shift

python3 - "\${GITHUB_WORKSPACE:-$PWD}/build/bindings/bindings/Geode/binding/SequenceTriggerGameObject.hpp" <<'PY'
from pathlib import Path
import re
import sys

header = Path(sys.argv[1])
if not header.is_file():
    raise SystemExit(0)

text = header.read_text(encoding="utf-8")
marker = "GEODE_ANDROID_SEQUENCE_TRIGGER_STATE_FIXED"
shim = """#ifndef GEODE_ANDROID_SEQUENCE_TRIGGER_STATE_FIXED
#define GEODE_ANDROID_SEQUENCE_TRIGGER_STATE_FIXED
class SequenceTriggerState {
public:
    gd::unordered_map<int, float> m_sequenceTimes;
    gd::unordered_map<int, int> m_sequenceIndices;
};
#endif

"""

if marker in text:
    pattern = re.compile(
        r"#if defined\\(GEODE_IS_ANDROID\\)\\s*"
        r"#ifndef GEODE_ANDROID_SEQUENCE_TRIGGER_STATE_FIXED\\s*"
        r"#define GEODE_ANDROID_SEQUENCE_TRIGGER_STATE_FIXED\\s*"
        r"class SequenceTriggerState\\s*\\{.*?\\n\\};\\s*"
        r"#endif\\s*#endif\\s*",
        re.S,
    )
    replacement = re.sub(pattern, shim, text, count=1)
    if replacement != text:
        text = replacement
elif "class SequenceTriggerGameObject" in text and "SequenceTriggerState m_sequenceState" in text:
    text = text.replace("class SequenceTriggerGameObject", shim + "class SequenceTriggerGameObject", 1)
else:
    raise SystemExit(0)

if text != header.read_text(encoding="utf-8"):
    header.write_text(text, encoding="utf-8")
    print("[BadPiggiesObjects] Patched Android 2.2081 SequenceTriggerState before compilation.")
PY

exec "$compiler" "$@"
