#ifndef OR_UTIL_H
#define OR_UTIL_H
#include "time.h"
#ifdef __cplusplus
extern "C" {
#endif


	int util_timeT_to_dateStr (time_t  localTimeT, char * dateStrBuf,  int bufSize);

	int util_timeT_to_dateStr_DDHHMM (time_t  localTimeT, char * dateStrBuf,  int bufSize, int *mday, int *HH, int *mm) ;


	void tm_add_month(const tm* in, tm* result, int months);
	time_t timet_add_month(const time_t date, int months);

#ifdef __cplusplus
}
#endif
#endif//OR_UTIL_H