include_guard()

include(${CMAKE_CURRENT_LIST_DIR}/../../ThirdParty/date/CMakeLists.txt)

set(TIMEZONE_UTILS_MODULE_NAME TimeZoneUtils)


add_library(${TIMEZONE_UTILS_MODULE_NAME}
        ${CMAKE_CURRENT_LIST_DIR}/TimezoneUtils.cpp
)

target_include_directories(${TIMEZONE_UTILS_MODULE_NAME} PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/>
)

target_link_libraries(${TIMEZONE_UTILS_MODULE_NAME} PUBLIC ${DATE_MODULE_NAME})

target_link_libraries(${TIMEZONE_UTILS_MODULE_NAME} PUBLIC spdlog::spdlog)