include_guard()

set(ENUMERATION_DAY_OFF_PATTERN_HELPER_NAME EnumerationDayOffPatternHelper)

project(${ENUMERATION_DAY_OFF_PATTERN_HELPER_NAME} LANGUAGES CXX)

add_library(${ENUMERATION_DAY_OFF_PATTERN_HELPER_NAME} STATIC
        ../EnumerationDayOffPatternHelper/EnumerationDayOffPatternHelper.cpp
)

target_include_directories(${ENUMERATION_DAY_OFF_PATTERN_HELPER_NAME} PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/>
)