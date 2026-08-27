include_guard()

option(ENABLE_HTTPS "Enable HTTPS request, need build OpenSSL in Linux" ON)
#By default, exprtk is disabled.
option(ENABLE_EXPRTK "Enable exprtk Script, need build exprtk" OFF)
#By default, Lua is disabled.
option(ENABLE_LUA "Enable LUA Script, need build Lua and LuaBridge" OFF)

# all local third party library for quick include
include(${CMAKE_CURRENT_LIST_DIR}/aes/CMakeLists.txt)
include(${CMAKE_CURRENT_LIST_DIR}/base64/CMakeLists.txt)
include(${CMAKE_CURRENT_LIST_DIR}/date/CMakeLists.txt)
include(${CMAKE_CURRENT_LIST_DIR}/mongoose/CMakeLists.txt)
include(${CMAKE_CURRENT_LIST_DIR}/rapidjson/CMakeLists.txt)
include(${CMAKE_CURRENT_LIST_DIR}/zlib/CMakeLists.txt)
include(${CMAKE_CURRENT_LIST_DIR}/spdlog/spdlog.cmake)
include(${CMAKE_CURRENT_LIST_DIR}/oatpp/oatpp.cmake)
include(${CMAKE_CURRENT_LIST_DIR}/csv_parser/CMakeLists.txt)

if (ENABLE_HTTPS)
    include(${CMAKE_CURRENT_LIST_DIR}/openssl/OpenSSL.cmake)
endif()

if (ENABLE_EXPRTK)
    include(${CMAKE_CURRENT_LIST_DIR}/exprtk/CMakeLists.txt)
endif()

if (ENABLE_LUA)
    include(${CMAKE_CURRENT_LIST_DIR}/LuaBridge/CMakeLists.txt)
endif()