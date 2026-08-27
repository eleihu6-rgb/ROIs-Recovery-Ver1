include_guard()

set(ThreadLocal_MODULE_NAME ThreadLocalInterface)

project(${ThreadLocal_MODULE_NAME} LANGUAGES CXX)

add_library(${ThreadLocal_MODULE_NAME} INTERFACE)

target_include_directories(${ThreadLocal_MODULE_NAME} INTERFACE
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/>
)