include_guard()

set(RULE_LOGGER_MODULE_NAME RuleLogger)


add_library(${RULE_LOGGER_MODULE_NAME}
        ${CMAKE_CURRENT_LIST_DIR}/Logger.cpp
)

target_include_directories(${RULE_LOGGER_MODULE_NAME} PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/>
)

target_link_libraries(${RULE_LOGGER_MODULE_NAME} PUBLIC spdlog::spdlog)



