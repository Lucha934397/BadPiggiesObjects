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

