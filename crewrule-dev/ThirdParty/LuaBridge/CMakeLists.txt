include_guard()

set(LuaBridge_MODULE_NAME LocalThirdPartyLuaBridge)

project(${LuaBridge_MODULE_NAME} VERSION 2.8 HOMEPAGE_URL https://github.com/vinniefalco/LuaBridge LANGUAGES C CXX)

aux_source_directory(${CMAKE_CURRENT_LIST_DIR}/Lua/lua-5.4.4/src/ LUABRIDGE_LUA54_FILES)
#remove luac.c
list(REMOVE_ITEM LUABRIDGE_LUA54_FILES "luac.c")

#message("lua source file list: ${LUABRIDGE_LUA54_FILES}}" )

add_library(${LuaBridge_MODULE_NAME} STATIC 
    ${LUABRIDGE_LUA54_FILES})

target_compile_definitions(${LuaBridge_MODULE_NAME} 
    PUBLIC LUABRIDGE_LUA_VERSION=504)


#config Lua and LuaBridge
target_compile_definitions(${LuaBridge_MODULE_NAME} 
    PUBLIC ENABLE_LUABRIDGE_LUA)

target_include_directories(${LuaBridge_MODULE_NAME} 
    PUBLIC $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/>
    PUBLIC $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/include/>
    PUBLIC $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/Lua/lua-5.4.4/src/>
)

