include_guard()

set(JsonTestTool_NAME JsonTestTool)

set(JsonTestTool_SRC
        ${CMAKE_CURRENT_LIST_DIR}/main.cpp
        ${CMAKE_CURRENT_LIST_DIR}/../RuleSrv/RuleSrvHandler.cpp
        ${CMAKE_CURRENT_LIST_DIR}/../RuleSrv/configParam.c
        ${CMAKE_CURRENT_LIST_DIR}/../RuleSrv/config.cpp
        ${CMAKE_CURRENT_LIST_DIR}/../RuleSrv/log.cpp
)

add_executable(${JsonTestTool_NAME} ${JsonTestTool_SRC})

target_include_directories(${JsonTestTool_NAME} PRIVATE
        ${CMAKE_CURRENT_LIST_DIR}/..
        ${CMAKE_CURRENT_LIST_DIR}/../RuleSrv
)

target_compile_definitions(${JsonTestTool_NAME} PRIVATE CREWRULE_GITHASH=${CREWRULE_GITHASH})

if (MSVC)
    target_link_options(${JsonTestTool_NAME} PRIVATE /MANIFEST:NO)
endif()

target_link_libraries(${JsonTestTool_NAME} PRIVATE ${RuleEngine_NAME})
