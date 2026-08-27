include_guard()
set(BASE64_MODULE_NAME LocalThirdPartyBASE64)

project(${BASE64_MODULE_NAME} DESCRIPTION "BASE64 module with unknown source" LANGUAGES C CXX)

add_library(${BASE64_MODULE_NAME} STATIC
        ${CMAKE_CURRENT_LIST_DIR}/base64.c
)

target_include_directories(${BASE64_MODULE_NAME} PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/>
)