include_guard()

include(${CMAKE_CURRENT_LIST_DIR}/../orUtil/CMakeLists.txt)
include(${CMAKE_CURRENT_LIST_DIR}/../db/CMakeLists.txt)
include(${CMAKE_CURRENT_LIST_DIR}/rule/CMakeLists.txt)
include(${CMAKE_CURRENT_LIST_DIR}/../db/DutyCode/CMakeLists.txt)

set(RuleEngine_NAME RuleEngine)

aux_source_directory(${CMAKE_CURRENT_LIST_DIR} ${RuleEngine_NAME}_SRC)

find_package(Threads REQUIRED)

add_library(${RuleEngine_NAME} STATIC ${${RuleEngine_NAME}_SRC})
target_include_directories(RuleEngine PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/>
)

target_link_libraries(${RuleEngine_NAME} PUBLIC ${GlobalDefinition_NAME})
target_link_libraries(${RuleEngine_NAME} PUBLIC Threads::Threads)
target_link_libraries(${RuleEngine_NAME} PUBLIC ${ORUtil_NAME})
target_link_libraries(${RuleEngine_NAME} PUBLIC ${DB_NAME})
target_link_libraries(${RuleEngine_NAME} PUBLIC ${RuleEngineFramework_NAME})
target_link_libraries(${RuleEngine_NAME} PUBLIC ${NewRuleEngineImpl_NAME})
target_link_libraries(${RuleEngine_NAME} PUBLIC ${QQ_6001_HELPER_NAME})
target_link_libraries(${RuleEngine_NAME} PUBLIC ${DutyCode_NAME})

# `CrewDataContext` (in `db`) calls into `DutyCodeConfig` symbols, so `db`
# must link `DutyCode` to ensure correct static-library link ordering.
target_link_libraries(${DB_NAME} PUBLIC ${DutyCode_NAME})
