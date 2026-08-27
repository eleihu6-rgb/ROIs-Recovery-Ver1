include_guard()

set(RapidJson_MODULE_NAME LocalThirdPartyRapidJson)

project(${RapidJson_MODULE_NAME} VERSION 0.11 HOMEPAGE_URL https://github.com/Tencent/rapidjson LANGUAGES CXX)

add_library(${RapidJson_MODULE_NAME} INTERFACE)

target_include_directories(${RapidJson_MODULE_NAME} INTERFACE
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/include>
)