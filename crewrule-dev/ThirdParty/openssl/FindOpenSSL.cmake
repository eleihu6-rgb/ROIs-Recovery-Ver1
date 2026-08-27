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