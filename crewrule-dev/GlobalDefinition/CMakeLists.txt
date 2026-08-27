include_guard()

set(GlobalDefinition_NAME RuleEngineDef)

add_library(${GlobalDefinition_NAME} INTERFACE)

target_include_directories(${GlobalDefinition_NAME} INTERFACE
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/>
)