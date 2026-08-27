#include "dateUtil.h"
#include "stdio.h"
#include <assert.h>

#ifdef __linux__
#define _snprintf snprintf
#endif

#define ERR_SUCCESS    0
#define ERR_ERROR      1    //未分类错误
#define ERR_PARAM      2

#define ERR_UNKNOWN    -1

int util_timeT_to_dateStr(time_t localTimeT, char * dateStrBuf, int bufSize) {
	int ret = ERR_UNKNOWN;
	tm  m = { 0 };
#ifdef WIN32
	int tmp = 0;
#else
	tm *tmp = nullptr;
#endif
	if (dateStrBuf == NULL) {
		ret = ERR_PARAM;
		goto CLEANUP;
	}
	if (bufSize < 11) {
		ret = ERR_PARAM;
		goto CLEANUP;
	}
#ifdef WIN32
	// For Windows, localtime_s成功则返回0,失败返回错误代码
	tmp = localtime_s(&m, &localTimeT);
	if (tmp != 0) {
		ret = ERR_ERROR;
		goto CLEANUP;
	}
#else
	//For Linux， localtime_r返回类型为tm*
	tmp = localtime_r(&localTimeT, &m);
	if (tmp != &m) {
		ret = ERR_ERROR;
		goto CLEANUP;
	}
#endif

	_snprintf(dateStrBuf, bufSize - 1, "%04d-%02d-%02d", m.tm_year + 1900, m.tm_mon + 1, m.tm_mday);

	ret = ERR_SUCCESS;
CLEANUP:
	return ret;
}


int util_timeT_to_dateStr_DDHHMM(time_t  localTimeT, char * dateStrBuf, int bufSize, int *mday, int *HH, int *mm) {
	int ret = ERR_UNKNOWN;
	tm  m = { 0 };
#ifdef WIN32
	int tmp = 0;
#else
	tm *tmp = nullptr;
#endif
	if (dateStrBuf == NULL || !mday || !HH || !mm) {
		ret = ERR_PARAM;
		goto CLEANUP;
	}
	if (bufSize < 11) {
		ret = ERR_PARAM;
		goto CLEANUP;
	}

#ifdef WIN32
	//For Windows
	tmp = localtime_s(&m, &localTimeT);
	if (tmp != 0) {
		ret = ERR_ERROR;
		goto CLEANUP;
	}
#else
	//For Linux
	tmp = localtime_r(&localTimeT, &m);
	if (tmp != &m) {
		ret = ERR_ERROR;
		goto CLEANUP;
	}
#endif

	_snprintf(dateStrBuf, bufSize - 1, "%04d-%02d-%02d %02d:%02d", m.tm_year + 1900, m.tm_mon + 1, m.tm_mday, m.tm_hour, m.tm_min);

	*HH = m.tm_hour;
	*mm = m.tm_min;
	*mday = m.tm_mday;

	ret = ERR_SUCCESS;
CLEANUP:
	return ret;
}

//-------------------------------- 月份计算 ----------------------------
bool IsLeapYear(int year)
{
	if (year % 4 != 0) return false;
	if (year % 400 == 0) return true;
	if (year % 100 == 0) return false;
	return true;
}

int _g_daysInMonths[] = { 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };

int GetDaysInMonth(int year, int month)
{
	if (month < 0 || month >= 12) {
		printf("invalid month=%d\n", month);
	}
	assert(month >= 0);
	assert(month < 12);

	int days = _g_daysInMonths[month];

	if (month == 1 && IsLeapYear(year)) // February of a leap year
		days += 1;

	return days;
}

#ifndef min
#define min(a,b) ((a<b)?a:b)
#endif

void tm_add_month(const tm* in, tm* result, int months)
{
	bool isLastDayInMonth = in->tm_mday == GetDaysInMonth(in->tm_year, in->tm_mon);

	int year = in->tm_year + (in->tm_mon + months) / 12;
	int month = (in->tm_mon + months) % 12;

	if (month < 0) {
		year--;
		month += 12;
	}

	if (month > 11)
	{
		year += 1;
		month -= 12;
	}

	int day;

	if (isLastDayInMonth)
		day = GetDaysInMonth(year, month); // Last day of month maps to last day of result month
	else
		day = min(in->tm_mday, GetDaysInMonth(year, month));


	result->tm_year = year;
	result->tm_mon = month;
	result->tm_mday = day;

	result->tm_hour = in->tm_hour;
	result->tm_min = in->tm_min;
	result->tm_sec = in->tm_sec;
}

time_t timet_add_month(const time_t date, int months)
{
	tm d = { 0 };
	tm result = { 0 };

#ifdef WIN32
	//For Windows
	localtime_s(&d, &date);
#else
	//For Linux
	localtime_r(&date, &d);
#endif
	tm_add_month(&d, &result, months);

	return mktime(&result);
}