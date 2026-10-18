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

# Geode 5.9.0's generated 2.2081 bindings forward-declare SequenceTriggerState
# but store it by value in SequenceTriggerGameObject. Include its full generated
# definition before that field is parsed. Only patches the generated build tree.
set(SEQ_TRIGGER_HEADER "${CMAKE_BINARY_DIR}/bindings/bindings/Geode/binding/SequenceTriggerGameObject.hpp")
if (EXISTS "${SEQ_TRIGGER_HEADER}")
    file(READ "${SEQ_TRIGGER_HEADER}" SEQ_TRIGGER_TEXT)
    string(FIND "${SEQ_TRIGGER_TEXT}" "#include <Geode/binding/SequenceTriggerState.hpp>" SEQ_STATE_INCLUDE_POS)
    if (SEQ_STATE_INCLUDE_POS EQUAL -1)
        string(FIND "${SEQ_TRIGGER_TEXT}" "#pragma once" SEQ_PRAGMA_POS)
        if (SEQ_PRAGMA_POS EQUAL -1)
            message(FATAL_ERROR "Cannot safely patch generated SequenceTriggerGameObject.hpp: #pragma once not found.")
        endif()
        string(REPLACE "#pragma once" "#pragma once\n#include <Geode/binding/SequenceTriggerState.hpp>" SEQ_TRIGGER_PATCHED "${SEQ_TRIGGER_TEXT}")
        file(WRITE "${SEQ_TRIGGER_HEADER}" "${SEQ_TRIGGER_PATCHED}")
        message(STATUS "Patched generated Geode binding: included complete SequenceTriggerState definition.")
    endif()
else()
    message(FATAL_ERROR "Expected generated binding not found: ${SEQ_TRIGGER_HEADER}")
endif()
