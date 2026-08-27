include_guard()

set(Exprtk_MODULE_NAME LocalThirdPartyExprtk)

project(${Exprtk_MODULE_NAME} VERSION 0.02 HOMEPAGE_URL https://github.com/ArashPartow/exprtk LANGUAGES CXX)

add_library(${Exprtk_MODULE_NAME} INTERFACE)

target_include_directories(${Exprtk_MODULE_NAME} INTERFACE
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/include>
)

#config Exprtk
target_compile_definitions(${Exprtk_MODULE_NAME} 
    PUBLIC ENABLE_EXPRTK)