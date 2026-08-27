include_guard()
set(AES_MODULE_NAME LocalThirdPartyAES)

project(${AES_MODULE_NAME} DESCRIPTION "AES module with unknown source" LANGUAGES C CXX)

add_library(${AES_MODULE_NAME} STATIC
        ${CMAKE_CURRENT_LIST_DIR}/aes.c
)

target_include_directories(${AES_MODULE_NAME} PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/>
)