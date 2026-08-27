include_guard()

set(DB_CSV_PARSER db_csv_parser)

add_library(${DB_CSV_PARSER} INTERFACE)

target_include_directories(${DB_CSV_PARSER} INTERFACE
        $<BUILD_INTERFACE:${CMAKE_CURRENT_LIST_DIR}/>
)
target_compile_definitions(${DB_CSV_PARSER} INTERFACE _HAS_STD_BYTE=0)