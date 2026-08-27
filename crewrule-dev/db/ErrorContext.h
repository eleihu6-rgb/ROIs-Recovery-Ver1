#ifndef ERROR_CONTEXT_H
#define ERROR_CONTEXT_H

#include <string>

using namespace std;

//common code
#define SUCCESS                0
#define ERR_PARAM            100


//error code
#define DB_SUCCESS             0
#define DB_ERR_INIT            1
#define DB_ERR_CONN_CREATE     2
#define DB_ERR_STMT_CREATE     3
#define DB_ERR_STMT_PREPARE    4
#define DB_ERR_BIND            5
#define DB_ERR_EXEC            6
#define DB_ERR_DATA            7     //invalid data, eg NULL

#define DB_ERR_PARAM         100
#define DB_ERR_UNSUPPORT     101     //
#define DB_ERR_SQL           102     //

//RuleSrv
#define ERR_OVERLAP        10001
#define ERR_RULE_CHECK     10002
#define ERR_INVALID_CREW   10003     //eg. crew not belong to scenario

#define SUCCESS                0
#define ERR_ALREADY_EXIST  20001
#define ERR_NOT_FOUND      20002
#define ERR_FILE_OPEN_FAIL 20003
#define ERR_COMPRESS_FAIL  20004

struct ErrorContext {
	int   errorCode = 0;
	char  errorMsgBuf[1024] = { 0 };
};

#endif//ERROR_CONTEXT_H
