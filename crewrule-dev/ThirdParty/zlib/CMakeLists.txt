include_guard()

set(ZLIB_MODULE_NAME LocalThirdPartyZLIB)

project(${ZLIB_MODULE_NAME} VERSION 1.2.8 HOMEPAGE_URL https://github.com/madler/zlib LANGUAGES C)

aux_source_directory(${CMAKE_CURRENT_LIST_DIR}/ ${ZLIB_MODULE_NAME}_SRC)

add_library(${ZLIB_MODULE_NAME} STATIC
        ${${ZLIB_MODULE_NAME}_SRC}
)

target_include_directories(${ZLIB_MODULE_NAME} PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/>
)