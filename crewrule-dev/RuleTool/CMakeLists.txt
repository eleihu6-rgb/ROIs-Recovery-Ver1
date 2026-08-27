include_guard()

set(RuleTool_NAME RuleTool)

include(${CMAKE_CURRENT_LIST_DIR}/../RuleEngine/CMakeLists.txt)

aux_source_directory(${CMAKE_CURRENT_LIST_DIR} ${RuleTool_NAME}_SRC)

add_executable(${RuleTool_NAME}
        ${${RuleTool_NAME}_SRC}
)

target_include_directories(${RuleTool_NAME} PRIVATE ${CMAKE_CURRENT_LIST_DIR})

target_compile_definitions(${RuleTool_NAME} PRIVATE CREWRULE_GITHASH=${CREWRULE_GITHASH})

if (MSVC)
    target_link_options(${RuleTool_NAME} PRIVATE /MANIFEST:NO)
endif()

target_link_libraries(${RuleTool_NAME} PRIVATE ${RuleEngine_NAME})
target_link_libraries(${RuleTool_NAME} PRIVATE ${DB_NAME})
