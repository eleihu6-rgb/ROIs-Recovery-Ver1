include_guard()

include(${CMAKE_CURRENT_LIST_DIR}/../GlobalDefinition/CMakeLists.txt)
include(${CMAKE_CURRENT_LIST_DIR}/../orUtil/CMakeLists.txt)
include(${CMAKE_CURRENT_LIST_DIR}/../ThirdParty/CMakeLists.txt)
include(${CMAKE_CURRENT_LIST_DIR}/../ThirdParty/csv_parser/CMakeLists.txt)


set(DB_NAME db)
#[[
 DB folder & target structure needs further refactor, cross includes in DB is a mess
 1. separate domain entity from the CrewBD.h and form an interface target
 2. CSV & JSON parser has its own target linking entity interface
 3. CrewDBContext, web service will link CSV, JSON, entity interface together as DB target
#]]

aux_source_directory(${CMAKE_CURRENT_LIST_DIR}/ ${DB_NAME}_SRC1)
aux_source_directory(${CMAKE_CURRENT_LIST_DIR}/csv ${DB_NAME}_SRC2)
aux_source_directory(${CMAKE_CURRENT_LIST_DIR}/CustomBiz ${DB_NAME}_SRC3)
aux_source_directory(${CMAKE_CURRENT_LIST_DIR}/JsonParser ${DB_NAME}_SRC4)
aux_source_directory(${CMAKE_CURRENT_LIST_DIR}/RDOHelper ${DB_NAME}_SRC5)
aux_source_directory(${CMAKE_CURRENT_LIST_DIR}/index ${DB_NAME}_SRC6)
aux_source_directory(${CMAKE_CURRENT_LIST_DIR}/PairingLabel ${DB_NAME}_SRC7)
aux_source_directory(${CMAKE_CURRENT_LIST_DIR}/DBTrainingStructure/Converter/src ${DB_NAME}_SRC8)

add_library(${DB_NAME} STATIC
        ${${DB_NAME}_SRC1}
        ${${DB_NAME}_SRC2}
        ${${DB_NAME}_SRC3}
        ${${DB_NAME}_SRC4}
        ${${DB_NAME}_SRC5}
        ${${DB_NAME}_SRC6}
        ${${DB_NAME}_SRC7}
        ${${DB_NAME}_SRC8}
)

target_compile_definitions(${DB_NAME} PUBLIC NOMINMAX)

target_include_directories(${DB_NAME} PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/>
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/csv>
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/CustomBiz>
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/JsonParser>
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/RDOHelper>
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/index>
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/DBTrainingStructure>
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/PairingLabel>
)

target_link_libraries(${DB_NAME} PUBLIC ${ORUtil_NAME})
target_link_libraries(${DB_NAME} PUBLIC ${GlobalDefinition_NAME})
target_link_libraries(${DB_NAME} PUBLIC ${AES_MODULE_NAME})
target_link_libraries(${DB_NAME} PUBLIC ${BASE64_MODULE_NAME})
target_link_libraries(${DB_NAME} PUBLIC ${Mongoose_MODULE_NAME})
target_link_libraries(${DB_NAME} PUBLIC ${ThreadLocal_MODULE_NAME})
target_link_libraries(${DB_NAME} PUBLIC ${TIMEZONE_UTILS_MODULE_NAME})
target_link_libraries(${DB_NAME} PUBLIC ${RULE_LOGGER_MODULE_NAME})
target_link_libraries(${DB_NAME} PUBLIC ${DATE_MODULE_NAME})
target_link_libraries(${DB_NAME} PUBLIC ${DB_CSV_PARSER})
