cmake_minimum_required(VERSION 3.10)

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# Optional components
option(ARM_CROSS_COMPILE_FOR_M_CHIP_MAC "Enable compile M-chip MacOS RuleSrv using ARM Linux server" OFF)
option(CREWRULE_ENABLE_GTEST "Enable GoogleTest-based RuleTest target" OFF)

if (ARM_CROSS_COMPILE_FOR_M_CHIP_MAC)
    set(ENABLE_HTTPS OFF) # Cross Compile only compile RuleSrv for Client, no https needed, and won't support https
    set(ENV{PreDownloadThirdPartyDir} /home/RuleMacOSMChipCompile/PreDownloadThirdPartyLibrary)
    # current ARM compile machine cannot access pier git, need download third party libraries
    add_subdirectory($ENV{PreDownloadThirdPartyDir}/spdlog-main ${CMAKE_BINARY_DIR}/spdlog)
    add_subdirectory($ENV{PreDownloadThirdPartyDir}/oatpp-main ${CMAKE_BINARY_DIR}/oatpp)
endif ()

# must compile in CXX 17 Standard
if (WIN32)
    set(CMAKE_CXX_STANDARD 17)
    add_compile_options("/utf-8")
    add_definitions(-D_CRT_SECURE_NO_WARNINGS)
    add_definitions(-D_CRT_NONSTDC_NO_DEPRECATE)
    add_compile_definitions(WIN32)
elseif (UNIX)
    set(CMAKE_CXX_FLAGS_DEBUG "-Og -g")
    set(CMAKE_CXX_FLAGS_RELEASE "-O3")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -m64 -std=c++17 -w")
else()
    message(WARNING "Unknown host platform; please ensure WIN32-style definitions are added if required.")
endif()

find_program(GIT git)
if ((GIT) AND (EXISTS ${CMAKE_CURRENT_SOURCE_DIR}/.git))
    execute_process(
            COMMAND ${GIT} log --date=local --pretty=format:"%H-%ad" -1
            WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
            OUTPUT_VARIABLE CREWRULE_GITHASH OUTPUT_STRIP_TRAILING_WHITESPACE)
else()
    set(CREWRULE_GITHASH "\"n/a\"")
endif ()
message(STATUS "CREWRULE_Git hash: " ${CREWRULE_GITHASH})

# Executables CMake
include(${CMAKE_CURRENT_LIST_DIR}/RuleSrv/CMakeLists.txt)
if (CREWRULE_ENABLE_GTEST)
    include(${CMAKE_CURRENT_LIST_DIR}/RuleTest/CMakeLists.txt)
endif ()
include(${CMAKE_CURRENT_LIST_DIR}/RuleTool/CMakeLists.txt)
include(${CMAKE_CURRENT_LIST_DIR}/JsonTestTool/CMakeLists.txt)

project(CrewRule LANGUAGES C CXX)
message(STATUS "CXX FLAGS: ${CMAKE_CXX_FLAGS}")
