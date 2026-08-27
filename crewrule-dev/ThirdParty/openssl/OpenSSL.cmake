include(ExternalProject)

if (UNIX OR APPLE)
    set(OPENSSL_SOURCE_DIR ${CMAKE_CURRENT_BINARY_DIR}/openssl-src) # default path by CMake
    set(OPENSSL_INSTALL_DIR ${CMAKE_CURRENT_BINARY_DIR}/openssl)
    set(OPENSSL_INCLUDE_DIR ${OPENSSL_INSTALL_DIR}/include)
    set(OPENSSL_CONFIGURE_COMMAND ${OPENSSL_SOURCE_DIR}/config)
    ExternalProject_Add(
        OpenSSL
        SOURCE_DIR ${OPENSSL_SOURCE_DIR}
        GIT_REPOSITORY http://192.168.199.112/pier-optimization-toolkit/openssl.git
        GIT_TAG OpenSSL_1_1_1w
        USES_TERMINAL_DOWNLOAD TRUE
        PATCH_COMMAND chmod +x ${OPENSSL_CONFIGURE_COMMAND}
        CONFIGURE_COMMAND
            ${OPENSSL_CONFIGURE_COMMAND}
            --prefix=${OPENSSL_INSTALL_DIR}
            --openssldir=${OPENSSL_INSTALL_DIR}
        BUILD_COMMAND make
        TEST_COMMAND ""
        #INSTALL_COMMAND make install
        INSTALL_COMMAND make install_sw
        INSTALL_DIR ${OPENSSL_INSTALL_DIR}
        # for ninja generator, add below line to help it get dependency right https://github.com/ninja-build/ninja/issues/760
        BUILD_BYPRODUCTS ${OPENSSL_INSTALL_DIR}/lib/libssl.a ${OPENSSL_INSTALL_DIR}/lib/libcrypto.a
    )


    # We cannot use find_library because ExternalProject_Add() is performed at build time.
    # And to please the property INTERFACE_INCLUDE_DIRECTORIES,
    # we make the include directory in advance.
    file(MAKE_DIRECTORY ${OPENSSL_INCLUDE_DIR})

    add_library(OpenSSL::SSL STATIC IMPORTED GLOBAL)
    set_property(TARGET OpenSSL::SSL PROPERTY IMPORTED_LOCATION ${OPENSSL_INSTALL_DIR}/lib/libssl.a)
    set_property(TARGET OpenSSL::SSL PROPERTY INTERFACE_INCLUDE_DIRECTORIES ${OPENSSL_INCLUDE_DIR})
    add_dependencies(OpenSSL::SSL OpenSSL)

    add_library(OpenSSL::Crypto STATIC IMPORTED GLOBAL)
    set_property(TARGET OpenSSL::Crypto PROPERTY IMPORTED_LOCATION ${OPENSSL_INSTALL_DIR}/lib/libcrypto.a)
    set_property(TARGET OpenSSL::Crypto PROPERTY INTERFACE_INCLUDE_DIRECTORIES ${OPENSSL_INCLUDE_DIR})
    add_dependencies(OpenSSL::Crypto OpenSSL)
    message("Openssl for linux is successfully fetched from external source.")
else (MSVC)
    #Windows uses compiled openssl library.
    set(OPENSSL_SOURCE_DIR ${CMAKE_CURRENT_BINARY_DIR}/openssl) # default path by CMake
    set(OPENSSL_INSTALL_DIR ${CMAKE_CURRENT_BINARY_DIR}/openssl)
    if(CMAKE_CL_64)
        set(OPENSSL_INCLUDE_DIR ${OPENSSL_INSTALL_DIR}/win64/include)
        set(OPENSSL_LIB_DIR ${OPENSSL_INSTALL_DIR}/win64/lib)
    else ()
        set(OPENSSL_INCLUDE_DIR ${OPENSSL_INSTALL_DIR}/win32/include)
        set(OPENSSL_LIB_DIR ${OPENSSL_INSTALL_DIR}/win32/lib)    
    endif ()
     
    ExternalProject_Add(
        OpenSSL
        SOURCE_DIR ${OPENSSL_SOURCE_DIR}
        GIT_REPOSITORY http://192.168.199.112/pier-optimization-toolkit/openssl-win.git
        GIT_TAG OpenSSL_1_1_1w
        GIT_SHALLOW TRUE
        GIT_PROGRESS TRUE
        USES_TERMINAL_DOWNLOAD TRUE
        PATCH_COMMAND ""
        CONFIGURE_COMMAND ""
        BUILD_COMMAND ""
        TEST_COMMAND ""
        INSTALL_COMMAND ""
        INSTALL_DIR ${OPENSSL_INSTALL_DIR}
        LOG_DOWNLOAD ON
    )
     
    include_directories(${OPENSSL_INCLUDE_DIR})
    link_directories(${OPENSSL_LIB_DIR})
    link_libraries(libssl_static libcrypto_static)
    message("Openssl for Windows is successfully fetched from external source.")
endif ()
    
