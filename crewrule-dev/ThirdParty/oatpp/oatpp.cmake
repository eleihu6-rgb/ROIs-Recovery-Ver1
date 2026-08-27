include_guard()

# if oatpp not been targeted, fetch oatpp form Pier GitLab
if (NOT TARGET oatpp)
    message(STATUS "Local oatpp::oatpp not found, try fetch from external source")
    SET(OATPP_LINK_TEST_LIBRARY ON CACHE INTERNAL "Link oat++ test library")
    include(FetchContent)
    FetchContent_Declare(
            oatpp
            ALIAS oatpp::oatpp
            GIT_REPOSITORY          http://192.168.199.112/pier-optimization-toolkit/oatpp.git
            GIT_TAG                 1.3.0-latest-cmake4+
            USES_TERMINAL_DOWNLOAD  ON # in case git credentials didn't get set up correctly
            OVERRIDE_FIND_PACKAGE
    )
    FetchContent_MakeAvailable(oatpp)
    
    if (oatpp_POPULATED)
        message(STATUS "oatpp::oatpp is successfully fetched from external source")
    endif ()

endif()