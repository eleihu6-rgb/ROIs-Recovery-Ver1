include_guard()

set(ORUtil_NAME orUtil)

include(${CMAKE_CURRENT_LIST_DIR}/../ThirdParty/CMakeLists.txt)
include(${CMAKE_CURRENT_LIST_DIR}/ThreadLocal/CMakeLists.txt)
include(${CMAKE_CURRENT_LIST_DIR}/TimeZoneUtil/CMakeLists.txt)
include(${CMAKE_CURRENT_LIST_DIR}/Log/CMakeLists.txt)

aux_source_directory(${CMAKE_CURRENT_LIST_DIR} ${ORUtil_NAME}_SRC)

add_library(${ORUtil_NAME} STATIC ${${ORUtil_NAME}_SRC})
target_include_directories(${ORUtil_NAME} PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/>
)

target_link_libraries(${ORUtil_NAME} PUBLIC spdlog::spdlog)

target_link_libraries(${ORUtil_NAME} PUBLIC ${ZLIB_MODULE_NAME})
target_link_libraries(${ORUtil_NAME} PUBLIC ${RapidJson_MODULE_NAME})
if (ENABLE_EXPRTK)
    target_link_libraries(${ORUtil_NAME} PUBLIC ${Exprtk_MODULE_NAME})
endif()
if (ENABLE_LUA)
    target_link_libraries(${ORUtil_NAME} PUBLIC ${LuaBridge_MODULE_NAME})
endif()

if (UNIX AND ${CMAKE_CXX_COMPILER_VERSION} VERSION_LESS 9)
    # add g++ 8.4 support for C++17 filesystem
    target_link_libraries(${ORUtil_NAME} PUBLIC stdc++fs)
endif ()

if (APPLE)
    # for clang, iconv needs to be manually linked
    target_link_libraries(${ORUtil_NAME} PUBLIC iconv)
endif ()

target_compile_options(${ORUtil_NAME} 
	PUBLIC 
	$<$<CXX_COMPILER_ID:MSVC>:/bigobj> 
	$<$<AND:$<CXX_COMPILER_ID:GNU>,$<BOOL:${GNU_BIG_OBJ_FLAG_ENABLE}>>:-Wa,-mbig-obj>) 
