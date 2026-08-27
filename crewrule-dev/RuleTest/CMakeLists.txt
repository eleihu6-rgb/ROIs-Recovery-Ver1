include_guard()

message(STATUS "RuleTest GoogleTest target enabled")

set(RuleTest_NAME RuleTest)

include(${CMAKE_CURRENT_LIST_DIR}/../RuleEngine/CMakeLists.txt)

find_package(GTest CONFIG QUIET)
if(NOT GTest_FOUND)
    find_package(GTest QUIET)
endif()

if(NOT GTest_FOUND)
    if(CMAKE_VERSION VERSION_LESS "3.11")
        message(FATAL_ERROR "GoogleTest not found and FetchContent requires CMake >= 3.11. Please provide a prebuilt GTest package.")
    endif()
    include(FetchContent)
    FetchContent_Declare(
        googletest
        GIT_REPOSITORY          http://192.168.199.112/pier-optimization-toolkit/googletest.git
        GIT_REMOTE_NAME         origin
        GIT_TAG                 v1.14.0
        USES_TERMINAL_DOWNLOAD  ON
    )
    set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
    FetchContent_MakeAvailable(googletest)
endif()

enable_testing()

aux_source_directory(${CMAKE_CURRENT_LIST_DIR} ${RuleTest_NAME}_SRC)
aux_source_directory(${CMAKE_CURRENT_LIST_DIR}/SIA ${RuleTest_NAME}_SRC)

add_executable(${RuleTest_NAME}
        ${${RuleTest_NAME}_SRC}
)

set(_ruletest_data_dir "${CMAKE_CURRENT_LIST_DIR}/data")
file(TO_CMAKE_PATH "${_ruletest_data_dir}" _ruletest_data_dir)
target_compile_definitions(${RuleTest_NAME} PRIVATE
        RULETEST_DATA_DIR="${_ruletest_data_dir}"
)

target_include_directories(${RuleTest_NAME} PRIVATE
        ${CMAKE_CURRENT_LIST_DIR}
        ${CMAKE_SOURCE_DIR}
)

if (MSVC)
    target_link_options(${RuleTest_NAME} PRIVATE /MANIFEST:NO)
endif()

target_link_libraries(${RuleTest_NAME} PRIVATE
        ${RuleEngine_NAME}
        GTest::gtest
        GTest::gtest_main
)

include(GoogleTest)
gtest_discover_tests(${RuleTest_NAME}
        DISCOVERY_MODE PRE_TEST
        WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
)
