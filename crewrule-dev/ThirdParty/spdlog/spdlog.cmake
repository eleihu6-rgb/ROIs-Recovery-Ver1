include_guard()

# if spdlog not been targeted, fetch spdlog form Pier GitLab
if (NOT TARGET spdlog::spdlog)
    message(STATUS "Local spdlog not found, try fetch from external source")
    include(FetchContent)
    FetchContent_Declare(
            spdlog
            GIT_REPOSITORY          http://192.168.199.112/pier-optimization-toolkit/spdlog.git
            GIT_REMOTE_NAME         origin/master
            GIT_TAG                 v1.14.1
            USES_TERMINAL_DOWNLOAD  ON # in case git credentials didn't get set up correctly
    )
    FetchContent_MakeAvailable(spdlog)
    if (spdlog_POPULATED)
        message(STATUS "spdlog is successfully fetched from external source")
    endif ()
endif()