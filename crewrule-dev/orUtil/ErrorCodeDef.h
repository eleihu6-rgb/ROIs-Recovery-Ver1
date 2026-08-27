
//解析errorCode到str, eg. 9 -> 'ERR_TIME_OUT'
const char* parseErrorCode(int errorCode);

//写 EndOfRun.txt, 成功则写入'SUCCESS', 失败则写入 'FAIL'
void writeEndOfRun(int errorCode, char* msg);

#define  OK_ROSTER                     0
#define  SUCCESS                       0

#define  ERR_TIME_OUT                  9
#define  ERR_OUT_OF_MEM                10

#define  ERR_ROSTER_IDSCENARIO         2001
#define  ERR_ROSTER_IDCREW             2002
#define  ERR_ROSTER_PAIR_ID            2003
#define  ERR_ROSTER_ROSTER_ID          2004
#define  ERR_ROSTER_STR_DT             2005
#define  ERR_ROSTER_REST_STR_DT        2006
#define  ERR_ROSTER_END_DT             2007
#define  ERR_ROSTER_DUTY               2008
#define  ERR_ROSTER_SOURCE             2009
#define  ERR_ROSTER_ACTING_RANK        2010
#define  ERR_ROSTER_ACT_STR_DT         2011
#define  ERR_ROSTER_ACT_END_DT         2012
#define  ERR_ROSTER_IS_VALID           2013
#define  ERR_ROSTER_IS_DELETE          2014
#define  ERR_ROSTER_IS_NOTIFIED        2015
#define  ERR_ROSTER_NOTIFIED_USER      2016
#define  ERR_ROSTER_NOTIFIED_TMST      2017
#define  ERR_ROSTER_LOCATION           2018
#define  ERR_ROSTER_IS_PUBLISHED       2019
#define  ERR_ROSTER_PUBLISHED_DT       2020
#define  ERR_ROSTER_APP_ID             2021
#define  ERR_ROSTER_CALLOUT_DT         2022
#define  ERR_ROSTER_ALLOC_CODE         2023
#define  ERR_ROSTER_ALLOC_TMST         2024
#define  ERR_ROSTER_COMMENTS           2025
#define  ERR_ROSTER_UNI_COMMENTS       2026
#define  ERR_ROSTER_DEALLOC_CODE       2027
#define  ERR_ROSTER_DEALLOC_IDUSER     2028
#define  ERR_ROSTER_TRG_ACTIVE_RANK    2029
#define  ERR_ROSTER_IS_TRAINING        2030
#define  ERR_ROSTER_IS_SWAP            2031
#define  ERR_ROSTER_SWAP_IDSTAFF       2032
#define  ERR_ROSTER_TTOT_IND           2033
#define  ERR_ROSTER_TOTAL_PAY_TIME     2034
#define  ERR_ROSTER_IDUSER             2035
#define  ERR_ROSTER_TMST               2036


#define ERR_RULE_PARAM_NOT_FOUND       7001  //
#define ERR_RULE_PARAM_NUMBER          7002  //param value is not a number
#define ERR_RULE_PARAM_EMPTY           7003  //param value is empty

#define ERR_RULE_AUTOTEST              7101  //autotest violation not match expect


#define  ERR_INVALID_COMPRESS_LEVEL    9010
#define  ERR_INVALID_COMPRESS_DATA     9011
#define  ERR_INVALID_ZLIB_VERSION      9012
#define  ERR_ALREADY_EXIST             20001
#define  ERR_NOT_FOUND                 20002
#define  ERR_FILE_OPEN_FAIL            20003
#define  ERR_COMPRESS_FAIL             20004

