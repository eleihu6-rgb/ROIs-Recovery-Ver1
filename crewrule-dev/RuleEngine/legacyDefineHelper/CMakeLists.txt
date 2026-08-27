include_guard()

include(${CMAKE_CURRENT_LIST_DIR}/../../db/CMakeLists.txt)

set(LegacyRuleEntity_NAME LegacyRuleEntity)

add_library(${LegacyRuleEntity_NAME} STATIC
        ${CMAKE_CURRENT_LIST_DIR}/RuleStatistics.cpp
)

target_include_directories(${LegacyRuleEntity_NAME} PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/>
)

target_link_libraries(${LegacyRuleEntity_NAME} PUBLIC ${DB_NAME})