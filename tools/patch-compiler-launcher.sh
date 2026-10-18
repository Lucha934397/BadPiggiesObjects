#!/usr/bin/env bash
set -euo pipefail

# The 2.2081 Android codegen output uses SequenceTriggerState by value but
# omits its header include. Patch the generated header immediately before
# compilation; the build graph runs Codegen again after CMake configuration.
compiler="$1"
shift

python3 - "$GITHUB_WORKSPACE/build/bindings/bindings/Geode/binding/SequenceTriggerGameObject.hpp" <<'PY'
from pathlib import Path
import re
import sys

header = Path(sys.argv[1])
if not header.is_file():
    raise SystemExit(0)

text = header.read_text(encoding="utf-8")
# Remove the old temporary class shim if this header came from a previous
# build-tree patch. The official generated SequenceTriggerState.hpp defines
# the full type; including it is safer than redefining the class here.
text = re.sub(
    r"#if defined\(GEODE_IS_ANDROID\)\s*"
    r"#ifndef GEODE_ANDROID_SEQUENCE_TRIGGER_STATE_FIXED\s*"
    r"#define GEODE_ANDROID_SEQUENCE_TRIGGER_STATE_FIXED\s*"
    r"class SequenceTriggerState\s*\{.*?\n\};\s*"
    r"#endif\s*#endif\s*",
    "",
    text,
    count=1,
    flags=re.S,
)
text = re.sub(
    r"#ifndef GEODE_ANDROID_SEQUENCE_TRIGGER_STATE_FIXED\s*"
    r"#define GEODE_ANDROID_SEQUENCE_TRIGGER_STATE_FIXED\s*"
    r"class SequenceTriggerState\s*\{.*?\n\};\s*"
    r"#endif\s*",
    "",
    text,
    count=1,
    flags=re.S,
)

include = "#include <Geode/binding/SequenceTriggerState.hpp>"
if include not in text:
    marker = "class SequenceTriggerGameObject"
    if marker not in text or "SequenceTriggerState m_sequenceState" not in text:
        raise SystemExit(0)
    text = text.replace(marker, include + "\n\n" + marker, 1)
    header.write_text(text, encoding="utf-8")
    print("[BadPiggiesObjects] Added the full generated SequenceTriggerState header before compilation.")
PY

exec "$compiler" "$@"
