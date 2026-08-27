include_guard()

set(QQ_6001_HELPER_NAME QQRDOHelper)

project(${QQ_6001_HELPER_NAME} LANGUAGES CXX)

add_library(${QQ_6001_HELPER_NAME} STATIC
        ${CMAKE_CURRENT_LIST_DIR}/Helper6001.cpp
        ${CMAKE_CURRENT_LIST_DIR}/Helper6001Cache.cpp
)

target_include_directories(${QQ_6001_HELPER_NAME} PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/>
)