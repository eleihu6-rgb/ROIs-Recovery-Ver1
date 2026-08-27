include_guard()

set(RuleSrv_NAME RuleSrv)

include(${CMAKE_CURRENT_LIST_DIR}/../RuleEngine/CMakeLists.txt)

aux_source_directory(${CMAKE_CURRENT_LIST_DIR} ${RuleSrv_NAME}_SRC)
aux_source_directory(${CMAKE_CURRENT_LIST_DIR}/test ${RuleSrv_NAME}_SRC2)

add_executable(${RuleSrv_NAME}
        ${${RuleSrv_NAME}_SRC}
        ${${RuleSrv_NAME}_SRC2}
)

target_include_directories(${RuleSrv_NAME} PRIVATE ${CMAKE_CURRENT_LIST_DIR})

target_link_libraries(${RuleSrv_NAME} PRIVATE ${RuleEngine_NAME})

target_compile_definitions(${RuleSrv_NAME} PUBLIC OATPP_SYNC_API)
target_compile_definitions(${RuleSrv_NAME} PRIVATE CREWRULE_GITHASH=${CREWRULE_GITHASH})

if (MSVC)
    target_link_options(${RuleSrv_NAME} PRIVATE /MANIFEST:NO)
endif()

target_link_libraries(${RuleSrv_NAME}  PUBLIC oatpp oatpp-test)