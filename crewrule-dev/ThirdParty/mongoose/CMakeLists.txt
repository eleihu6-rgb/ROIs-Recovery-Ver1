include_guard()
set(Mongoose_MODULE_NAME LocalThirdPartyMongoose)

project(${Mongoose_MODULE_NAME} VERSION 6.6 HOMEPAGE_URL https://github.com/cesanta/mongoose LANGUAGES C CXX)

add_library(${Mongoose_MODULE_NAME} STATIC
        ${CMAKE_CURRENT_LIST_DIR}/mongoose.c
)

target_include_directories(${Mongoose_MODULE_NAME} PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/>
)

if (ENABLE_HTTPS)
    #config Mongoose SSL
    target_compile_definitions(${Mongoose_MODULE_NAME} PUBLIC MG_ENABLE_SSL DISABLE_MD5)
    if (UNIX OR APPLE)
        target_link_libraries(${Mongoose_MODULE_NAME} PUBLIC OpenSSL::SSL OpenSSL::Crypto dl)
    else (MSVC)
        add_dependencies(${Mongoose_MODULE_NAME} OpenSSL)
        target_link_libraries(${Mongoose_MODULE_NAME} PUBLIC libssl_static libcrypto_static)
    endif()
    message("Enable https.")
endif()
