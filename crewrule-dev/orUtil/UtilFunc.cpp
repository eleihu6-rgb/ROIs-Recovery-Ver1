#ifdef _WIN32
#include <Windows.h>
LARGE_INTEGER nFreq = { 0 };

#else
#include <time.h>
#include <sys/time.h>
#include <string.h>
#include <stdint.h>
#include <errno.h>
#include <iconv.h>
#include <algorithm>
#define _snprintf	snprintf
#define FALSE		0
#define TRUE		1
#endif
#include <stdio.h>
#include <vector>
#include <map>

#include <sstream>
#include <thread>
#include <time.h>


#include "UtilFunc.h"
#include "time64.h"
#include "Log/Logger.h"

using namespace std;

long long getTimestampNano() {
	#ifdef WIN32
		LARGE_INTEGER li = { 0 };
		if (nFreq.QuadPart == 0)
			QueryPerformanceFrequency(&nFreq);
		QueryPerformanceCounter(&li);
		return (long long)((double)li.QuadPart * 1000000000.0 / (double)nFreq.QuadPart);
	#else
		struct timeval nowTime;
		gettimeofday(&nowTime, NULL);
		return (long long)((double)nowTime.tv_sec * 1000000.0 + (double)nowTime.tv_usec);
	#endif
}

//从time_t获取对应日期是日期星期几
//return:  sun:0, mon:1, ...
int getWdayOfUtc(time_t utc) {
	int wday = 0;
	tm m = { 0 };

	gmtime_64_s(utc, &m);
	return m.tm_wday;
}

time_t getLocalDayStartInUTC(time_t utc, int offsetMinutes) {

	time_t t = utc + offsetMinutes * 60;

	tm gm = { 0 };
	time_t gt = 0;
	gmtime_64_s(t, &gm);

	return (t - gm.tm_hour * 3600 - gm.tm_min * 60 - gm.tm_sec);

}

void copyStrToBuf(const char* str, char* buf, int len) {
	if (str == NULL) 
		return;
	else
		strncpy(buf, str, len);
}

int isDigit(char ch) {
	if (ch >= '0' && ch <= '9')
		return 1;  //true
	else
		return 0;  //false
}
int isAlphaBeta(char ch) {
	if (ch >= 'a' && ch <= 'z')
		return 1;  //true
	else if (ch >= 'A' && ch <= 'Z')
		return 1;  //true
	else
		return 0;  //false
}

//字符串转整数, 若失败返回default value
//如果包含非数字char, 则返回第一个遇到的数字字符开始到数字字符结束表示的整数, 如 'abc123' -> 123, '123abc' -> 123
//返回遇到的第一个整数, 如 '123abc456' -> 123
int retriveIntFromStr(string str, int defaultValue) {
	int sum = 0;
	for (std::size_t i = 0; i < str.length(); i++) {
		char ch = str.at(i);
		if (!isDigit(ch))
			if (sum == 0)
				continue;
			else
				break;
		sum = sum * 10 + (ch - '0');
	}
	return sum;
}

//从utc 转为 local time_t
time_t utcToLocal(time_t utc) {

	time_t t = utc;
	//计算offset，将mktime结果修正为utc
	tm lm = {0};
	tm gm = {0};
	time_t lt = 0;
	time_t gt = 0;
	//errno_t err0 = 0;
	//errno_t err1 = 0;
	//err0 = _localtime32_s(&lm, (__time32_t *)&t);
	//err1 = _gmtime32_s(&gm, (__time32_t *)&t);
	lm = *localtime_64(t);
	gmtime_64_s(t, &gm);//20181018 ain, mantis#4289

	lt = mktime_64(&lm);
	gt = mktime_64(&gm);
	time_t offset = lt - gt;
	return t + offset;
}

//从utc 转为 local time_t
time_t localToUtc(time_t local) {

	time_t t = local;
	//计算offset，将mktime结果修正为utc
	tm lm = { 0 };
	tm gm = { 0 };
	time_t lt = 0;
	time_t gt = 0;
	// errno_t err0 = 0;
	// errno_t err1 = 0;
	//err0 = _localtime32_s(&lm, (__time32_t *)&t);
	//err1 = _gmtime32_s(&gm, (__time32_t *)&t);
	lm = *localtime_64(t);
	gmtime_64_s(t, &gm);//20181018 ain, mantis#4289

	lt = mktime_64(&lm);
	gt = mktime_64(&gm);
	time_t offset = lt - gt;
	return t - offset;
}

//从string转为utc
//buf: 格式yyyy-MM-dd (HH-mm-ss)，其中时间部分为可选
//2015-02-01 or 2015-02-01 12:10:00 
time_t utcStrToUtc(char * buf) {
	tm   m;
	time_t t = 0;
	int  i = 0;
	int  beg = 0;
	int  end = 0;
	int  len = (int)strlen(buf);
	char dt[6][5] = {0};
	int  dtIndex = 0;
	int  year = 0;
	int  mon = 0;
	int  date = 0;
	int  HH = 0;
	int  mm = 0;
	int  ss = 0;

	if (buf == NULL || buf[0] == '\0' || strlen(buf) < 8) {
		return -1;
	}
	strToTm(buf, &m);
	t = mktime_64(&m);

	////计算offset，将mktime结果修正为utc
	//tm lm = {0};
	//tm gm = {0};
	//time_t lt = 0;
	//time_t gt = 0;
	////errno_t err0 = _localtime32_s(&lm, (__time32_t *)&t);
	////errno_t err1 = _gmtime32_s(&gm, (__time32_t *)&t);
	//lm = *localtime_64(t);
	//lt = mktime_64(&lm);
	//gt = mktime_64(&gm);
	//long offset = lt - gt;
	//return t + offset;
	return t;
}

int numDaysInMonth(int year, int month) {
	switch (month) {
		case 1:
			return 31;
		case 2:
			return ((year % 4 == 0 && year % 100 != 0) || year % 400 == 0) ? 29 : 28;
		case 3:
			return 31;
		case 4:
			return 30;
		case 5:
			return 31;
		case 6:
			return 30;
		case 7:
			return 31;
		case 8:
			return 31;
		case 9:
			return 30;
		case 10:
			return 31;
		case 11:
			return 30;
		case 12:
			return 31;
	}

	printf("%s", "Wrong in calculating numDaysInMonth!\n");
	exit(1);
}

//从local string转为utc
//buf: 格式yyyy-MM-dd (HH-mm-ss)，其中时间部分为可选
//2015-02-01 or 2015-02-01 12:10:00 
time_t localStrToUtc(char * buf, int offsetMinutes) {
	int secondsInADay = 1440;
	tm   m_local;
	tm   m_utc;

	int  len = (int)strlen(buf);
	if (buf == NULL || buf[0] == '\0') {
		return -1;
	}
	strToTm(buf, &m_local);

	if (m_local.tm_hour * 60 + m_local.tm_min - offsetMinutes >= 1440) { //时差转换后，UTC向前跨一天
		int minutesOnNextDay = (m_local.tm_hour * 60 + m_local.tm_min - offsetMinutes) - 1440;

		m_utc.tm_year = m_local.tm_year; //先设定UTC_year等于Local_year, 如果跨年，稍后更改
		int daysInMonth = numDaysInMonth(m_local.tm_year + 1900, m_local.tm_mon + 1);
		if (m_local.tm_mday != daysInMonth) {//如果不是月的最后一天，则不涉及跨月。月份相同，天数+1
			m_utc.tm_mon = m_local.tm_mon;
			m_utc.tm_mday = m_local.tm_mday + 1;
		}
		else {//如果是月的最后一天
			if (m_local.tm_mon < 11) {//如果不是December, 则月份+1，天设为第一天
				m_utc.tm_mon = m_local.tm_mon + 1;
				m_utc.tm_mday = 1;
			}
			else {//如果是December，意味着跨年，则年份+1，月份身为一月，天设为第一天
				m_utc.tm_year = m_local.tm_year + 1;  
				m_utc.tm_mon = 0;
				m_utc.tm_mday = 1;
			}
		}
		
		m_utc.tm_hour = minutesOnNextDay / 60;
		m_utc.tm_min = minutesOnNextDay % 60;
		m_utc.tm_sec = m_local.tm_sec;
		
	}
	else if (m_local.tm_hour * 60 + m_local.tm_min - offsetMinutes < 0) { //时差转换后，UTC向后退一天
		int minutesOnPrevDay = (m_local.tm_hour * 60 + m_local.tm_min - offsetMinutes) + 1440;

		m_utc.tm_year = m_local.tm_year; //先设定UTC_year等于Local_year, 如果跨年，稍后更改
		
		if (m_local.tm_mday != 1) {//如果不是月的第一天，则不涉及跨月。月份相同，天数-1
			m_utc.tm_mon = m_local.tm_mon;
			m_utc.tm_mday = m_local.tm_mday - 1;
		}
		else {//如果是月的第一天
			if (m_local.tm_mon == 0) {//如果是January, 意味着跨年，则年份-1，月份为December，天为31号
				m_utc.tm_year = m_local.tm_year - 1;
				m_utc.tm_mon = 11;
				m_utc.tm_mday = 31;
			}
			else {//如果是Feburary-December, 年份不变，月份-1，天设为前一月最后一天
				m_utc.tm_mon = m_local.tm_mon - 1;
				int daysInMonth = numDaysInMonth(m_local.tm_year + 1900, m_local.tm_mon); //计算前一个月有多少天
				m_utc.tm_mday = daysInMonth;
			}
		}

		m_utc.tm_hour = minutesOnPrevDay / 60;
		m_utc.tm_min = minutesOnPrevDay % 60;
		m_utc.tm_sec = m_local.tm_sec;
	}
	else {
		int minutesOnCurrentDay = m_local.tm_hour * 60 + m_local.tm_min - offsetMinutes;

		m_utc.tm_year = m_local.tm_year;
		m_utc.tm_mon = m_local.tm_mon;
		m_utc.tm_mday = m_local.tm_mday;

		m_utc.tm_hour = minutesOnCurrentDay / 60;
		m_utc.tm_min = minutesOnCurrentDay % 60;
		m_utc.tm_sec = m_local.tm_sec;
	}
	
	time_t t = mktime_64(&m_utc);
	
	return t;
}

void utcToMMDDHHmmStr(time_t utc, char * buf, int bufsize) {
	time_t t = utc;
	int year = 0;
	int mon = 0;
	int date = 0;
	int hh = 0;
	int mm = 0;
	int ss = 0;
	tm m;

	if (utc == -1) {
		buf[0] = 0;
		return;
	}

	//gmtime_s(&m, &t);
	gmtime_64_s(t, &m);
	year = m.tm_year + 1900;
	mon = m.tm_mon + 1;
	date = m.tm_mday;
	hh = m.tm_hour;
	mm = m.tm_min;
	ss = m.tm_sec;

	memset(buf, 0, bufsize);
	_snprintf(buf, bufsize, "%02d-%02d %02d:%02d", mon, date, hh, mm);
}

time_t getYearStart(time_t time) {
	time_t t = time;
	tm m;
	gmtime_64_s(t, &m);
	m.tm_mon = m.tm_hour = m.tm_min = m.tm_sec = 0;
	m.tm_mday = 1;
	time = mktime_64(&m);

	return time;
}

time_t getYearEnd(time_t time){	
	time_t t = time;
	tm m;
	gmtime_64_s(t, &m);
	m.tm_year++;
	m.tm_mon = m.tm_hour = m.tm_min = m.tm_sec = 0;
	m.tm_mday = 1;
	time = mktime_64(&m);

	return time - 1;
}

string utcToMMDDHHmmString(time_t utc) {
	char buf[100] = { 0 };
	utcToMMDDHHmmStr(utc, buf, sizeof(buf));
	return buf;
}

void utcToUtcStr(time_t utc, char * buf, int bufsize, const char * fmt) {
	time_t t = utc;
	int year = 0;
	int mon = 0;
	int date = 0;
	int hh = 0;
	int mm = 0;
	int ss = 0;
	tm m;

	if (utc == -1) {
		buf[0] = 0;
		return;
	}

	//gmtime_s(&m, &t);
	gmtime_64_s(t, &m);
	year = m.tm_year + 1900;
	mon = m.tm_mon + 1;
	date = m.tm_mday;
	hh = m.tm_hour;
	mm = m.tm_min;
	ss = m.tm_sec;

	memset(buf, 0, bufsize);
	_snprintf(buf, bufsize, fmt, year, mon, date, hh, mm, ss);
}

void utcToYYYYMMDDHHmmss(time_t t, int& year, int& mon, int& date, int& HH, int& mm, int& ss) {

	int i = 0;
	char formatBuf[40] = { 0 };
	tm m;
	gmtime_64_s(t, &m);
	year = m.tm_year + 1900;
	mon = m.tm_mon + 1;
	date = m.tm_mday;
	HH = m.tm_hour;
	mm = m.tm_min;
	ss = m.tm_sec;
}

//从utc time_t获取对应utc str 形如'yyyy-mm-dd HH:mm:ss' 时间字符串
void utcToUtcStr(time_t utc, char * buf, int bufsize) {
	utcToUtcStr(utc, buf, bufsize, "%04d-%02d-%02d %02d:%02d:%02d");
}

void utcToUtcDtStr(time_t utc, char * buf, int bufsize, const char * format) {
	time_t t = utc;
	int year = 0;
	int mon = 0;
	int date = 0;
	char formatBuf[40] = { 0 };
	tm m = { 0 };
	//20181018 ain, mantis#4289, 外部指定缓冲 m, 避免多次函数调用共用缓冲造成问题
	gmtime_64_s(t, &m);
	year = m.tm_year + 1900;
	mon = m.tm_mon + 1;
	date = m.tm_mday;

	strncpy(formatBuf, format, sizeof(formatBuf) - 1);
	for (std::size_t i = 0; i < strnlen(formatBuf, sizeof(formatBuf)); i++) {
		formatBuf[i] = tolower(formatBuf[i]);
	}

	memset(buf, 0, bufsize);
	if (0 == strncmp(formatBuf, "yyyymmdd", sizeof(formatBuf)))
		_snprintf(buf, bufsize, "%04d%02d%02d", year, mon, date);
	else
		_snprintf(buf, bufsize, "%04d-%02d-%02d", year, mon, date);
	

}

//从utc time_t获取对应utc 形如'yyyy-mm-dd ' 日期字符串
void utcToUtcDtStr(time_t utc, char * buf, int bufsize) {
	utcToUtcDtStr(utc, buf, bufsize, "yyyy-mm-dd");

}
string utcToUtcDtString(time_t utc) {
	char buf[40] = { 0 };
	utcToUtcDtStr(utc, buf, sizeof(buf) - 1);
	return buf;
}

//支持format: yyyy-mm-dd/ yyyymmdd
string utcToUtcDtString(time_t utc, char * format) {
	char buf[40] = { 0 };
	utcToUtcDtStr(utc, buf, sizeof(buf) - 1, format);
	return buf;
}

string utcToUtcString(time_t utc) {
	char buf[40] = { 0 };
	utcToUtcStr(utc, buf, sizeof(buf) - 1);
	return buf;
}

string utcToUtcTzString(time_t utc) {
	char buf[40] = { 0 };
	utcToUtcStr(utc, buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02d");
	return buf;
}


string utcToUtcHHMM(time_t t) {
	char buf[40] = { 0 };
	int year = 0;
	int mon = 0;
	int date = 0;
	int hh = 0;
	int mm = 0;
	int ss = 0;
	tm m = { 0 };

	if (t == -1) {
		buf[0] = 0;
		return "";
	}

	gmtime_64_s(t, &m);//20181018 ain, mantis#4289
	year = m.tm_year + 1900;
	mon = m.tm_mon + 1;
	date = m.tm_mday;
	hh = m.tm_hour;
	mm = m.tm_min;
	ss = m.tm_sec;

	memset(buf, 0, sizeof(buf));
	_snprintf(buf, sizeof(buf)-1, "%02d%02d", hh, mm);
	string result = buf;
	return result;
}

//'20180101' -> time_t(2018-1-1 00:00)=
time_t dateStrToTime(string str) {
	if (str.length() != 8) {
		Logger::getRuleLogger()->error("invalid param, dateStrToTime({})", str);
		return 0;
	}
	int n = atoi(str.c_str());
	int yyyy = n / 10000;
	int mm = (n % 10000) / 100;
	int dd = n % 100;
	return makeTimeT(yyyy, mm, dd, 0, 0, 0);
}

//按 yyyy-MM-dd HH:mm:ss方式解析str为 tm
string tmToDtStr(struct tm * m) {
	stringstream ss;
	ss << m->tm_year + 1900 << "-";
	ss << m->tm_mon + 1 << "-";
	ss << m->tm_mday;
	return ss.str();
}

static map<string, int> monthNames;
void s_initMonthNames() {
	string list[] = {
		"Jan", "Feb", "Mar", "Apr",
		"May", "Jun", "Jul", "Aug",
		"Sep", "Oct", "Nov", "Dec"
	};
	for (int i = 0; i < 12; i++) {
		monthNames[list[i]] = i + 1;
		monthNames[strToUpper(list[i])] = i + 1;
		monthNames[strToLower(list[i])] = i + 1;
	}
}

//按 yyyy-MM-dd HH:mm:ss方式解析str为 tm
//1 eg: 1956-1-1 -> {year=1956-1900, mon=1-1, mday=1}
//2 支持分隔符 '/','-'
//3 支持月份按名缩写
//4 支持 yyyy/MM/dd, MM/dd/yyyy, dd/MM/yyyy, dd/MMM/yy
//5 当无法分辨 MMdd前后顺序时，按>12为dd识别，否则默认dd/MM/yyyy
void strToTm(char* buf, struct tm * m) {
	
	int  i = 0;
	int  beg = 0;
	int  end = 0;
	int  len = (int)strlen(buf);
	char dt[6][5] = { 0 };
	int  dtIndex = 0;
	int  year = 0;
	int  mon = 0;
	int  date = 0;
	int  HH = 0;
	int  mm = 0;
	int  ss = 0;
	bool monthIsAlphaBeta = false;

	if (monthNames.size() == 0) {
		s_initMonthNames();
	}

	if (buf == NULL || buf[0] == '\0') {
		return ;
	}

	//解析字符串到 yyyy, MM, dd
	while (i < len) {
		while (!isDigit(buf[i]) && (dtIndex==1 && !isAlphaBeta(buf[i])) && i < len)
			i++;
		if (i >= len)
			break;
		beg = i;

		while ((isDigit(buf[i]) || (dtIndex == 1 && isAlphaBeta(buf[i]))) && i < len)
			i++;
		end = i;

		if (isAlphaBeta(buf[beg])) {
			monthIsAlphaBeta = true;
		}
		strncpy(dt[dtIndex], &buf[beg], end - beg);

		i++;
		dtIndex++;
		if (dtIndex >= 6)
			break;
	}


	//从year mon date值获取utc time_t值
	if (!monthIsAlphaBeta) {
		int dateIndex = 2;
		int monthIndex = 1;
		int yearIndex = strlen(dt[2]) == 4 ? 2 : 0;
		if (yearIndex == 2) {
			if (atoi(dt[0]) > 12) {
				dateIndex = 0; monthIndex = 1;
			}
			else if (atoi(dt[1]) > 12) {
				dateIndex = 1; monthIndex = 0;
			}
			else {
				dateIndex = 0; monthIndex = 1;
			}
		}
		year = atoi(dt[yearIndex]);
		mon = atoi(dt[monthIndex]);
		date = atoi(dt[dateIndex]);
	}
	else {
		if (strlen(dt[2]) == 4)
			year = atoi(dt[2]);
		else
			year = 2000 + atoi(dt[2]);
		mon = monthNames[dt[1]] + 1;
		date = atoi(dt[0]);
	}
	HH = atoi(dt[3]);
	mm = atoi(dt[4]);
	ss = atoi(dt[5]);
	m->tm_year = year - 1900;
	m->tm_mon = mon - 1;
	m->tm_mday = date;
	m->tm_hour = HH;
	m->tm_min = mm;
	m->tm_sec = ss;
	m->tm_isdst = -1;
}

static time_t s_timeZoneOffset = 0;
static bool   s_timeZoneOffsetHasSet = false;

//从YYYYMMDD HHmmss获取 time_t
time_t makeTimeT(int year, int mon, int day, int hour, int min, int sec) {

	time_t t = 0;
	tm     m = { 0 };
	tm     utc = { 0 };
	tm     loc = { 0 };
	time_t utcT = 0;
	time_t locT = 0;

	m.tm_year = year - 1900;
	m.tm_mon = mon - 1;
	m.tm_mday = day;
	m.tm_hour = hour;
	m.tm_min = min;
	m.tm_sec = sec;
	t = mktime_64(&m);
	return t;
}

//日期为当年第几天
static int month_days[12] = { 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };
int dayOfYear(int month, int mday) {
	int sum = 0;
	int i = 0;

	for (int i = 0; i < month - 1; i++) {
		sum += month_days[i];
	}

	return sum + mday;
}

//从utc time_t获取对应local 形如'yyyy-mm-dd ' 日期字符串
void utcToLocalDtStr(time_t utc, char * buf, int bufsize) {
	time_t t = utc;
	int year = 0;
	int mon = 0;
	int date = 0;
	tm m;
	//localtime_s(&m, &t);
	m = *localtime_64(t);
	year = m.tm_year + 1900;
	mon = m.tm_mon + 1;
	date = m.tm_mday;

	memset(buf, 0, bufsize);
	_snprintf(buf, bufsize, "%04d-%02d-%02d", year, mon, date);

}


void timeTmToStr(tm * input, char * buf, int bufsize) {
	int year = 0;
	int mon = 0;
	int date = 0;
	int hh = 0;
	int mm = 0;
	int ss = 0;
	year = input->tm_year + 1900;
	mon = input->tm_mon + 1;
	date = input->tm_mday;
	hh = input->tm_hour;
	mm = input->tm_min;
	ss = input->tm_sec;

	memset(buf, 0, bufsize);
	_snprintf(buf, bufsize, "%04d-%02d-%02d %02d:%02d:%02d", year, mon, date, hh, mm, ss);
}

//get time from 1970-1-1 08:00 in seconds
time_t makeUTC(int year, int mon, int day, int hour, int min, int sec)
{
	time_t t = 0;
	tm     m = {0};
	m.tm_year = year - 1900;
	m.tm_mon = mon - 1;
	m.tm_mday = day;
	m.tm_hour = hour;
	m.tm_min = min;
	m.tm_sec = sec;
	t = mktime_64(&m);
	return t;
}



//get time from 1970-1-1 08:00 in seconds
time_t makeLoc(int year, int mon, int day, int hour, int min, int sec)
{
	return makeTimeT(year, mon, day, hour, min, sec);
}

//check date-time-str, eg 2018-4-30 --> OK, 2018-4-31 --> wrong
bool checkDateTimeStr(const char* str) {

	tm   m = { 0 };
	int  mdays = 0;

	if (str == NULL || str[0] == '\0') {
		return FALSE;
	}
	strToTm((char*)str, &m);
	//check data range
	if (m.tm_mon > 11)
		return FALSE;
	if (m.tm_mday > 31)
		return FALSE;
	if (m.tm_hour >= 24)
		return FALSE;
	if (m.tm_min >= 60)
		return FALSE;
	if (m.tm_sec >= 60)
		return FALSE;
	//check mday
	switch (m.tm_mon + 1) {
	case 1: mdays = 31; break;
	case 2: mdays = (m.tm_mon + 1 == 2 && m.tm_year % 4 == 0 && m.tm_year % 100 != 0) ? 29 : 28; break;
	case 3: mdays = 31; break;
	case 4: mdays = 30; break;
	case 5: mdays = 31; break;
	case 6: mdays = 30; break;
	case 7: mdays = 31; break;
	case 8: mdays = 31; break;
	case 9: mdays = 30; break;
	case 10: mdays = 31; break;
	case 11: mdays = 30; break;
	case 12: mdays = 31; break;
	}
	//leaf year
	if (m.tm_mday > mdays)
		return FALSE;
	return TRUE;
}

//将char* 解析为str列表
//void split(const char * input, char delim, vector<string> &result) {
//	
//	if (input == NULL) {
//		return;
//	}
//	std::stringstream ss( input );
//	
//	while( ss.good() )
//	{
//		string substr;
//		getline( ss, substr, delim);
//		result.push_back( substr );
//	}
//}

//将char* 解析为int列表
void split(const char * input, char delim, vector<int> &result) {
	int val = 0;
	if (input == NULL) {
		return;
	}
	std::stringstream ss( input );
	while( ss.good() )
	{
		string substr;
		getline( ss, substr, delim);
		if (substr.length() > 0) {
			val = atoi(substr.c_str());
			result.push_back(val);
		}
	}
}

void split(const char * input, char delim, vector<long long> &result) {
	long long val = 0;
	if (input == NULL) {
		return;
	}
	std::stringstream ss(input);
	while (ss.good())
	{
		string substr;
		getline(ss, substr, delim);
		if (substr.length() > 0) {
			val = atoll(substr.c_str());
			result.push_back(val);
		}
	}
}

void split(const char * input, char delim, std::unordered_set<std::string> &result) {
	if (input == NULL) {
		return;
	}
	std::stringstream ss(input);
	while (ss.good())
	{
		string substr;
		getline(ss, substr, delim);
		if (substr.length() > 0) {
			result.insert(substr);
		}
	}
}


vector<int> strListToIntList(vector<string> &strList) {
	vector<int> intList;
	std::size_t i = 0;
	
	for (i = 0; i < strList.size(); i++) {
		const string &str = strList[i];

	}

	return intList;
}


//根据time_t计算对应日期的开始时间，即00:00
time_t getStartTimeOfDay(time_t utc) {
	time_t startOfDay = 0;
	time_t t = utc;
	tm  m = {0};
#ifdef WIN32
	gmtime_s(&m, &t);
#else
	gmtime_r(&t, &m);	
#endif
	startOfDay = utc - m.tm_hour * 3600 - m.tm_min * 60 - m.tm_sec;
	return startOfDay;
}

//计算time_t时间段对应天数
int getDaysByDuration(time_t utcBeg, time_t utcEnd) {
	int days = 0;
	time_t startOfBeg = 0;
	time_t startOfEnd = 0;

	startOfBeg = getStartTimeOfDay(utcBeg);
	startOfEnd = getStartTimeOfDay(utcEnd);


	days = static_cast<int>(startOfEnd - startOfBeg) / (24 * 3600);
	return days;
}

string numberToTimeHHMM(int num){
	string time = num / 60 + ":" + num % 60;
	return 	time;
}

//检查字符串是否符合格式 HH:mm
//1 只能由数字和：组成
//2 冒号位置只能在[1]和[2]
//3 只能有1个：
bool isHHmm(const char * str) {
	int i = 0, j = 0, len = 0, count = 0, index = 0;
	if (str == NULL)
		return false;

	count = 0;
	len = (int)strlen(str);
	
	//mantis#3153, 修正允许小时超出 100
	//除冒号外都是数字
	for (i = 0; i < len; i++) {
		char ch = str[i];
		if ((ch < '0' || ch > '9') && ch != ':'){
			return false;
		}
		if (ch == ':') {
			count++;
			index = i;
		}
	}

	//收尾冒号不合法
	if (index == 0 || index == len - 1)
		return false;

	return true;
}

//01:30 --> 90, return -1 on err
int hhmmToMinutes(const char * str) {
	int i = 0, len = 0, hh = 0, mm = 0;
	bool afterColon = false;
	if (!isHHmm(str))
		return -1;
	len = (int)strlen(str);
	for (i = 0; i < len; i++) {
		char ch = str[i];
		if (ch == ':') {
			afterColon = true;
		}
		else if (afterColon) {
			mm = mm * 10 + ch - '0';
		}
		else {
			hh = hh * 10 + ch - '0';
		}
	}
	return hh * 60 + mm;
}

//str "12:20" -> int 1220
//return -1 for error
int hhmmStrToHHmmInt(const string& hhMmStr) {
	std::size_t i = 0;
	int hh = 0;
	int mm = 0;
	bool foundColon = false;
	for (i = 0; i < hhMmStr.length(); i++) {
		if (hhMmStr.at(i) == ':') {
			foundColon = true;
			continue;
		}
		char ch = hhMmStr.at(i);
		if (ch < '0' || ch > '9')
			return -1;
		if (!foundColon)
			hh = hh * 10 + ch - '0';
		else
			mm = mm * 10 + ch - '0';
	}
	if (!foundColon) {
		return -1;
	}
	return hh * 100 + mm;
}

//str "12:20" -> int 12 * 60 + 30 = 780
//return -1 for error
int hhmmStrToMinutes(const string& hhMmStr) {
	int tmp = hhmmStrToHHmmInt(hhMmStr);
	if (tmp == -1)
		return -1;
	return (tmp / 100) * 60 + (tmp % 100);
}

//指定vector中是否包含item
bool isContains(vector<string>& list, string item) {
	for (std::size_t i = 0; i < list.size(); i++) {
		if (list[i] == item)
			return true;
	}
	return false;
}
bool isContains(vector<int>& list, int item) {
	for (std::size_t i = 0; i < list.size(); i++) {
		if (list[i] == item)
			return true;
	}
	return false;
}

bool isContains(vector<long long>& list, long long item) {
	for (std::size_t i = 0; i < list.size(); i++) {
		if (list[i] == item)
			return true;
	}
	return false;
}

//判断2个list是否相同，不考虑顺序
bool isEqualIntList(vector<int>& list1, vector<int>& list2) {
	if (list1.size() != list2.size())
		return false;
	map<int, int> m;
	for (auto& i : list1) {
		m[i] = i;
	}
	for (auto& i : list2) {
		if (m.find(i) == m.end())
			return false;
	}
	return true;
}

//判断2个list是否相同，不考虑顺序
bool isEqualIntList(vector<long long>& list1, vector<long long>& list2) {
	if (list1.size() != list2.size())
		return false;
	map<long long, long long> m;
	for (auto& i : list1) {
		m[i] = i;
	}
	for (auto& i : list2) {
		if (m.find(i) == m.end())
			return false;
	}
	return true;
}

//default delim=' '
string joinStrList(vector<string> list) {
	return joinStrList(list, " ");
}
string joinStrList(vector<string> list, string delim) {
	stringstream ss;
	for (std::size_t i = 0; i < list.size(); i++) {
		ss << list[i];
		if (i < list.size() - 1)
			ss << delim; 
	}
	return ss.str();
}
//default delim=' '
string joinIntList(vector<int> list) {
	return joinIntList(list, " ");
}
string joinIntList(vector<int> list, string delim) {
	stringstream ss;
	for (std::size_t i = 0; i < list.size(); i++) {
		ss << list[i];
		if (i < list.size()-1)
			ss << delim;
	}
	return ss.str();
}

string joinIntList(vector<long long> list) {
	return joinIntList(list, " ");
}

string joinIntList(vector<long long> list, string delim) {
	stringstream ss;
	for (std::size_t i = 0; i < list.size(); i++) {
		ss << list[i];
		if (i < list.size() - 1)
			ss << delim;
	}
	return ss.str();
}

string joinStrList(const std::unordered_set<string>& list, string delim) {
	stringstream ss;
	int i = 0;
	for (auto iter = list.begin(); iter != list.end(); iter++, i++) {
		ss << *iter;
		if (i < list.size() - 1)
			ss << delim;
	}
	return ss.str();
}

string joinStrList(const std::map<string, int>& list, string delim, bool isKey) {
	stringstream ss;
	int i = 0;
	for (auto iter = list.begin(); iter != list.end(); iter++, i++) {
		if (isKey) {
			ss << iter->first;
		}
		else {
			ss << iter->second;
		}

		if (i < list.size() - 1)
			ss << delim;
	}
	return ss.str();
}

string joinMapToStr(const map<string, int>& m, const string demli) {
	stringstream iss;
	for (auto it = m.begin(); it != m.end(); it++) {
		iss << it->first << ":" << it->second;
		if (std::next(it) == m.end()) {
			break;
		}
		iss << demli;
	}
	return iss.str();
}

string joinMapToStr(const map<string, long long>& m, const string demli) {
	stringstream iss;
	for (auto it = m.begin(); it != m.end(); it++) {
		iss << it->first << ":" << it->second;
		if (std::next(it) == m.end()) {
			break;
		}
		iss << demli;
	}
	return iss.str();
}

void replaceAll(std::string& str, const std::string& from, const std::string& to) {
	if (from.empty())
		return;
	size_t start_pos = 0;
	while ((start_pos = str.find(from, start_pos)) != std::string::npos) {
		str.replace(start_pos, from.length(), to);
		start_pos += to.length(); // In case 'to' contains 'from', like replacing 'x' with 'yx'
	}
}

void formatFilePath(std::string& path) {
	if (path.empty())
		return;
#ifdef WIN32
	replaceAll(path, "/", "\\");
	replaceAll(path, "\\\\", "\\");
#else
	replaceAll(path, "\\", "/");
	replaceAll(path, "//", "/");
#endif

}


void utf8ToGbk(const char* utf8, char* gbkBuf, int gbkBufSize, int * realSize) {

	

#ifdef WIN32
	//** Windows编译，字符编码utf-8转gbk
	
	int len = MultiByteToWideChar(CP_UTF8, 0, utf8, -1, NULL, 0);
	LPWCH wszGBK = (LPWCH) new unsigned short[len + 1];
	memset(wszGBK, 0, len * 2 + 2);
	MultiByteToWideChar(CP_UTF8, 0, utf8, -1, wszGBK, len);

	printf("utf8ToGbk:   %s -> %ws  %S\n", utf8, wszGBK, wszGBK);

	*realSize = WideCharToMultiByte(CP_ACP, 0, wszGBK, -1, NULL, 0, NULL, NULL);
	if (*realSize > gbkBufSize - 1) {
		return;
	}
	memset(gbkBuf, 0, gbkBufSize);
	WideCharToMultiByte(CP_ACP, 0, wszGBK, -1, gbkBuf, *realSize, NULL, NULL);
	delete[] wszGBK;
#else
	// Linux 编译，字符编码utf-8转gbk
	int inlen = strlen(utf8);
	size_t inlen_sizet = inlen;
	size_t gbkBufSize_sizet = gbkBufSize;
	iconv_t cd;
	char *const_cast_utf8 = const_cast<char *>(utf8);
	char **pin = &const_cast_utf8;
	char **pout = &gbkBuf;

	cd = iconv_open("gbk","utf-8");
	if (cd == 0)
		return;
	if (iconv(cd, pin, &inlen_sizet, pout, &gbkBufSize_sizet) == -1)
		return;
	iconv_close(cd);
#endif
}

string UTF8ToGBK(const std::string& strUTF8)
{
#ifdef WIN32
	 //* Windows 编译， 字符编码utf-8转gbk
	int len = MultiByteToWideChar(CP_UTF8, 0, strUTF8.c_str(), -1, NULL, 0);
	LPWCH wszGBK = (LPWCH) new unsigned short[len + 1];
	memset(wszGBK, 0, len * 2 + 2);
	MultiByteToWideChar(CP_UTF8, 0, (LPCSTR)strUTF8.c_str(), -1, wszGBK, len);

	len = WideCharToMultiByte(CP_ACP, 0, wszGBK, -1, NULL, 0, NULL, NULL);
	char *szGBK = new char[len + 1];
	memset(szGBK, 0, len + 1);
	WideCharToMultiByte(CP_ACP, 0, wszGBK, -1, szGBK, len, NULL, NULL);
	//strUTF8 = szGBK;
	std::string strTemp(szGBK);
	delete[]szGBK;
	delete[]wszGBK;
	return strTemp;
#else
	// Linux 编译，字符编码utf-8转gbk
	char *utf8 = const_cast<char *>(strUTF8.c_str());
	int inlen = strlen(utf8);
	size_t inlen_sizet = inlen;

	string strRet;
	strRet.resize(inlen * 2 + 2);
	size_t outlen_sizet = strRet.size();
	char *outbuf = &strRet[0];

	iconv_t cd;
	char **pin = &utf8;
	// char **pin = &(const_cast<char *>(strUTF8));
	char **pout = &outbuf;

	cd = iconv_open("gbk", "utf-8");
	if (cd == 0)
		return strUTF8;
	if (iconv(cd, pin, &inlen_sizet, pout, &outlen_sizet) == -1)
		return strUTF8;
	iconv_close(cd);
	return strRet;
#endif
	
}



bool strEndsWith(string& value, string ending) {
	if (ending.size() > value.size()) return false;
	return std::equal(ending.rbegin(), ending.rend(), value.rbegin());
}

string& trim(string &s)
{
	if (s.empty())
	{
		return s;
	}
	const std::string WHITESPACE = " \n\r\t\f\v";
	s.erase(0, s.find_first_not_of(WHITESPACE));
	s.erase(s.find_last_not_of(WHITESPACE) + 1);
	return s;
}

void split(const std::string &s, char delim, std::vector<std::string> &results) {
	//std::stringstream ss;
	//ss.str(s);
	//std::string item;
	//while (std::getline(ss, item, delim)) {
	//	results.push_back(item);
	//}

	std::vector<std::string> tmpResults;
	tmpResults.reserve(std::count(s.begin(), s.end(), delim) + 1); // optional
	std::string::const_iterator start = s.begin();
	std::string::const_iterator end = s.end();
	std::string::const_iterator next = std::find(start, end, delim);
	while (next != end) {
		tmpResults.emplace_back(start, next);
		start = next + 1;
		next = std::find(start, end, delim);
	}
	tmpResults.emplace_back(start, next);

	for (auto& tmpResult : tmpResults) {
		results.emplace_back(trim(tmpResult));
	}

}

void split(const std::string& s, char delim, std::set<std::string>& results) {
	//std::stringstream ss;
	//ss.str(s);
	//std::string item;
	//while (std::getline(ss, item, delim)) {
	//	results.push_back(item);
	//}

	std::vector<std::string> tmpResults;
	tmpResults.reserve(std::count(s.begin(), s.end(), delim) + 1); // optional
	std::string::const_iterator start = s.begin();
	std::string::const_iterator end = s.end();
	std::string::const_iterator next = std::find(start, end, delim);
	while (next != end) {
		tmpResults.emplace_back(start, next);
		start = next + 1;
		next = std::find(start, end, delim);
	}
	tmpResults.emplace_back(start, next);

	for (auto& tmpResult : tmpResults) {
		results.emplace(trim(tmpResult));
	}

}

//获取list与 compareTo差别，返回存在于list但不存在于compareTo的部分
void makeDifferentList(vector<long long>& list, vector<long long>& compareTo, vector<long long>& result) {
	map<long long, int> compareToMap;
	for (long long& v : compareTo) {
		compareToMap[v] = 1;
	}
	for (long long& v : list) {
		if (compareToMap.find(v) == compareToMap.end())
			result.push_back(v);
	}
}

size_t hashString(string& str) {
	size_t ret = 17;
	for (std::size_t i = 0; i < str.length(); i++) {
		ret += str.at(i) * 31;
	}
	return ret;
}


size_t getThreadId() {
	//return std::this_thread::get_id().hash();
	return 0;
}

// 1234567 -> '1,234,567'
string formatInt(int n) {
	int i = 0, len = 0;
	char buf[40] = { 0 };
	stringstream ss;

	// For Linux
	sprintf(buf, "%d", n);

	// For Windows
	//_itoa(n, buf, 10);
	
	len = (int)strnlen(buf, sizeof(buf));
	for (i = 0; i < len; i++) {
		if ( i > 0 && (len - i - 1) % 3 == 0)
			ss << ',';
		ss << buf[i];
	}
	return ss.str();
}

// 1234567 -> '1234567'
string intToStr(int n) {
	stringstream ss;
	ss << n;
	return ss.str();
}

//按username=xxxx方式获取参数值xxxx
string retriveStrArgInCmdline(int argc, char** argv, char* argName) {
	int i = 0;
	string strValue = "";
	string target = argName;
	for (i = 0; i < argc; i++) {
		string arg = argv[i];
		if (arg == target && i < argc - 1) {
			strValue = argv[i + 1];
			break;
		}
		if (arg.find("=") != string::npos && arg.find(argName) == 0) {
			vector<string> raw;
			split(arg.c_str(), '=', raw);
			if (raw.size() >= 2 && 0 == strncmp(argName, raw[0].c_str(), strlen(argName)))
				strValue = (char*)raw[1].c_str();
			break;
		}
	}
	return strValue;
}

//按argName value方式获取参数值value
int retriveIntArgInCmdline(int argc, char** argv, char* argName) {
	int i = 0;
	char * strValue = NULL;
	for (i = 0; i < argc - 1; i++) {
		if (0 == strncmp(argv[i], argName, strlen(argName))) {
			strValue = argv[i + 1];
			break;
		}
	}
	if (strValue == NULL)
		return 0;
	else
		return atoi(strValue);
}

//在命令行参数中寻找 argName的参数值
char* findArgInCmdline(int argc, char** argv, char* argName) {
	int i = 0;
	for (i = 0; i < argc - 1; i++) {
		if (0 == strncmp(argv[i], argName, strlen(argName))) {
			return argv[i + 1];
		}
	}
	return NULL;
}

bool checkArgInCmdLine(int argc, char** argv, char* argName) {
	int i = 0;
	for (i = 0; i < argc; i++) {
		if (0 == strncmp(argv[i], argName, strlen(argName))) {
			return true;
		}
	}
	return false;
}

//当输入为 'True'/'Yes'/'1'时返回true，否则返回false, 忽略大小写
bool isValueYesTrueOne(const char* value) {
	int i = 0;
	char buf[5] = { 0 };
	if (!value)
		return false;
	//copy & upperCase
	strncpy(buf, value, 4);
	for (i = 0; i < 4; i++) {
		if (buf[i] == '\0')
			break;
		buf[i] = toupper(buf[i]);
	}
	//cmp
	if (0 == strncmp(buf, "TRUE", 4)) {
		return true;
	}
	if (0 == strncmp(buf, "Y", 1)) {
		return true;
	}
	if (0 == strncmp(buf, "1", 1)) {
		return true;
	}
	return false;
}
int getNum(const char a[])
{
	int i = 0, num = 0;
	while (a[i] != '\0')
	{
		if (a[i] >= '0' && a[i] <= '9')
			num = num * 10 + a[i] - '0';
		i++;
	}
	return num;
}
string getStringByFilterDigit(string value)
{
	stringstream ss;
	for (auto& i : value)
	{
		if (i >= '0' && i <= '9')
		{
			continue;
		}
		ss << i;
	}
	return ss.str();
}
