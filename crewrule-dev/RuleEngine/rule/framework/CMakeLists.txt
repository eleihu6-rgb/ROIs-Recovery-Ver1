include_guard()

include(${CMAKE_CURRENT_LIST_DIR}/../../../db/CMakeLists.txt)
include(${CMAKE_CURRENT_LIST_DIR}/../../legacyDefineHelper/CMakeLists.txt)

set(RuleEngineFramework_NAME RuleEngineFramework)

project(${RuleEngineFramework_NAME} LANGUAGES CXX)

aux_source_directory(${CMAKE_CURRENT_LIST_DIR}/period ${RuleEngineFramework_NAME}_SRC1)
aux_source_directory(${CMAKE_CURRENT_LIST_DIR}/utils ${RuleEngineFramework_NAME}_SRC2)
aux_source_directory(${CMAKE_CURRENT_LIST_DIR}/matcher ${RuleEngineFramework_NAME}_SRC3)

add_library(${RuleEngineFramework_NAME} STATIC
        ${${RuleEngineFramework_NAME}_SRC1}
        ${${RuleEngineFramework_NAME}_SRC2}
        ${${RuleEngineFramework_NAME}_SRC3}
)

target_include_directories(${RuleEngineFramework_NAME} PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/>
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/violationcollector>
)

target_link_libraries(${RuleEngineFramework_NAME} PUBLIC ${DB_NAME})
target_link_libraries(${RuleEngineFramework_NAME} PUBLIC ${LegacyRuleEntity_NAME})
target_link_libraries(${RuleEngineFramework_NAME} PUBLIC spdlog::spdlog)