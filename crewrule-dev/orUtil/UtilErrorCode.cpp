#include <fstream>
#include "ErrorCodeDef.h"

//20181112 ain, mantis#4196, 输出文件'END_OF_RUN.txt',描述执行是否成功
void writeEndOfRun(int errorCode, char* msg) {
	std::ofstream out("EndOfRun.txt");
	if (errorCode == SUCCESS) {
		out << "SUCCESS";
	}
	else {
		out << "FAIL (" << errorCode << ")" << parseErrorCode(errorCode) << " " << msg;
	}
	out.close();
}

const char* parseErrorCode(int errorCode) {
	if (errorCode == 0) return "SUCCESS";

	else if (errorCode == 9) return "ERR_TIME_OUT";
	else if (errorCode == 10) return "ERR_OUT_OF_MEM";

	else if (errorCode == 2001) return "ERR_ROSTER_IDSCENARIO";
	else if (errorCode == 2002) return "ERR_ROSTER_IDCREW";
	else if (errorCode == 2003) return "ERR_ROSTER_PAIR_ID";
	else if (errorCode == 2004) return "ERR_ROSTER_ROSTER_ID";
	else if (errorCode == 2005) return "ERR_ROSTER_STR_DT";
	else if (errorCode == 2006) return "ERR_ROSTER_REST_STR_DT";
	else if (errorCode == 2007) return "ERR_ROSTER_END_DT";
	else if (errorCode == 2008) return "ERR_ROSTER_DUTY";
	else if (errorCode == 2009) return "ERR_ROSTER_SOURCE";
	else if (errorCode == 2010) return "ERR_ROSTER_ACTING_RANK";
	else if (errorCode == 2011) return "ERR_ROSTER_ACT_STR_DT";
	else if (errorCode == 2012) return "ERR_ROSTER_ACT_END_DT";
	else if (errorCode == 2013) return "ERR_ROSTER_IS_VALID";
	else if (errorCode == 2014) return "ERR_ROSTER_IS_DELETE";
	else if (errorCode == 2015) return "ERR_ROSTER_IS_NOTIFIED";
	else if (errorCode == 2016) return "ERR_ROSTER_NOTIFIED_USER";
	else if (errorCode == 2017) return "ERR_ROSTER_NOTIFIED_TMST";
	else if (errorCode == 2018) return "ERR_ROSTER_LOCATION";
	else if (errorCode == 2019) return "ERR_ROSTER_IS_PUBLISHED";
	else if (errorCode == 2020) return "ERR_ROSTER_PUBLISHED_DT";
	else if (errorCode == 2021) return "ERR_ROSTER_APP_ID";
	else if (errorCode == 2022) return "ERR_ROSTER_CALLOUT_DT";
	else if (errorCode == 2023) return "ERR_ROSTER_ALLOC_CODE";
	else if (errorCode == 2024) return "ERR_ROSTER_ALLOC_TMST";
	else if (errorCode == 2025) return "ERR_ROSTER_COMMENTS";
	else if (errorCode == 2026) return "ERR_ROSTER_UNI_COMMENTS";
	else if (errorCode == 2027) return "ERR_ROSTER_DEALLOC_CODE";
	else if (errorCode == 2028) return "ERR_ROSTER_DEALLOC_IDUSER";
	else if (errorCode == 2029) return "ERR_ROSTER_TRG_ACTIVE_RANK";
	else if (errorCode == 2030) return "ERR_ROSTER_IS_TRAINING";
	else if (errorCode == 2031) return "ERR_ROSTER_IS_SWAP";
	else if (errorCode == 2032) return "ERR_ROSTER_SWAP_IDSTAFF";
	else if (errorCode == 2033) return "ERR_ROSTER_TTOT_IND";
	else if (errorCode == 2034) return "ERR_ROSTER_TOTAL_PAY_TIME";
	else if (errorCode == 2035) return "ERR_ROSTER_IDUSER";
	else if (errorCode == 2036) return "ERR_ROSTER_TMST";
	else if (errorCode == 9010) return "ERR_INVALID_COMPRESS_LEVEL";
	else if (errorCode == 9011) return "ERR_INVALID_COMPRESS_DATA";
	else if (errorCode == 9012) return "ERR_INVALID_ZLIB_VERSION";
	else if (errorCode == 20001) return "ERR_ALREADY_EXIST";
	else if (errorCode == 20002) return "ERR_NOT_FOUND";
	else if (errorCode == 20003) return "ERR_FILE_OPEN_FAIL";
	else if (errorCode == 20004) return "ERR_COMPRESS_FAIL";
	else return "UNKNOWN";
}