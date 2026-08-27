include_guard()

include(${CMAKE_CURRENT_LIST_DIR}/../CMakeLists.txt)

set(DutyCode_NAME DutyCode)

aux_source_directory(${CMAKE_CURRENT_LIST_DIR}/ ${DutyCode_NAME}_SRC1)

add_library(${DutyCode_NAME} STATIC
        ${${DutyCode_NAME}_SRC1}
)

target_include_directories(${DutyCode_NAME} PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/>
)

target_link_libraries(${DutyCode_NAME} PUBLIC ${DB_NAME})