include_guard()

set(DATE_MODULE_NAME LocalThirdPartyDate)

project(${DATE_MODULE_NAME} HOMEPAGE_URL https://github.com/HowardHinnant/date LANGUAGES C CXX)

add_library(${DATE_MODULE_NAME} STATIC
        ${CMAKE_CURRENT_LIST_DIR}/src/tz.cpp
)

#HowardHinnant/date not link curl library
target_compile_definitions(${DATE_MODULE_NAME} PUBLIC AUTO_DOWNLOAD=0 HAS_REMOTE_API=0)

target_include_directories(${DATE_MODULE_NAME} PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/include/>
)