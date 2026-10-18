cmake_minimum_required(VERSION 3.21)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_CXX_VISIBILITY_PRESET hidden)

project(BadPiggiesObjects VERSION 1.3.0)

if (NOT DEFINED ENV{GEODE_SDK})
    message(FATAL_ERROR "GEODE_SDK must point to a compatible Geode SDK")
endif()

find_program(NODE_EXECUTABLE node REQUIRED)
if (NOT EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/node_modules/sharp")
    message(FATAL_ERROR "The sprite extractor dependency is missing. Run npm install before building.")
endif()

execute_process(
    COMMAND "${NODE_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/tools/extract-original-parts.mjs"
    WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
    RESULT_VARIABLE ASSET_RESULT
    COMMAND_ECHO STDOUT
)
if (NOT ASSET_RESULT EQUAL 0)
    message(FATAL_ERROR "Original Bad Piggies sprite extraction failed; see the error above.")
endif()

file(GLOB_RECURSE SOURCES CONFIGURE_DEPENDS src/*.cpp)
add_library(${PROJECT_NAME} SHARED ${SOURCES})
add_subdirectory($ENV{GEODE_SDK} ${CMAKE_CURRENT_BINARY_DIR}/geode)
setup_geode_mod(${PROJECT_NAME})

# Android64 compatibility fix for the generated GD 2.2081 bindings. On Android
# the generated SequenceTriggerState header is only a forward declaration, but
# SequenceTriggerGameObject stores the type by value. Define the exact two
# fields declared in bindings/2.2081/Extras.bro before that class is parsed.
set(SEQ_TRIGGER_HEADER "${CMAKE_BINARY_DIR}/bindings/bindings/Geode/binding/SequenceTriggerGameObject.hpp")
if (EXISTS "${SEQ_TRIGGER_HEADER}")
    file(READ "${SEQ_TRIGGER_HEADER}" SEQ_TRIGGER_TEXT)
    string(FIND "${SEQ_TRIGGER_TEXT}" "GEODE_ANDROID_SEQUENCE_TRIGGER_STATE_FIXED" SEQ_STATE_FIXED_POS)
    if (SEQ_STATE_FIXED_POS EQUAL -1)
        string(FIND "${SEQ_TRIGGER_TEXT}" "class SequenceTriggerGameObject" SEQ_CLASS_POS)
        if (SEQ_CLASS_POS EQUAL -1)
            message(FATAL_ERROR "Cannot patch generated SequenceTriggerGameObject.hpp: class declaration not found.")
        endif()
        set(SEQ_STATE_SHIM "#if defined(GEODE_IS_ANDROID)\n#ifndef GEODE_ANDROID_SEQUENCE_TRIGGER_STATE_FIXED\n#define GEODE_ANDROID_SEQUENCE_TRIGGER_STATE_FIXED\nclass SequenceTriggerState {\npublic:\n    gd::unordered_map<int, float> m_sequenceTimes;\n    gd::unordered_map<int, int> m_sequenceIndices;\n};\n#endif\n#endif\n\n")
        string(REPLACE "class SequenceTriggerGameObject" "${SEQ_STATE_SHIM}class SequenceTriggerGameObject" SEQ_TRIGGER_PATCHED "${SEQ_TRIGGER_TEXT}")
        file(WRITE "${SEQ_TRIGGER_HEADER}" "${SEQ_TRIGGER_PATCHED}")
        message(STATUS "Patched Android64 GD 2.2081 SequenceTriggerState layout from Extras.bro.")
    endif()
else()
    message(FATAL_ERROR "Expected generated binding not found: ${SEQ_TRIGGER_HEADER}")
endif()
