
#ifdef _WIN32
#include <Windows.h>
#else
#include <sys/time.h>
#endif
#include <sstream>
#include <string>
#include <iostream>
#include <thread>
#include <stdio.h>
#include <stdarg.h>
#include <time.h>
#include "OrLog.h"

#if defined(__unix) || defined(__APPLE__)
    #define _snprintf snprintf
    #define printf_s printf
#endif

struct st_time {
	int year = 0;
	int month = 0;
	int day = 0;
	int hour = 0;
	int min = 0;
	int sec = 0;
	int ms = 0;
};

void getTime(st_time* result) {
	if (!result) {
		return;
	}

#ifdef WIN32
	SYSTEMTIME st;
	GetSystemTime(&st);
	result->year = st.wYear;
	result->month = st.wMonth;
	result->day = st.wDay;
	result->hour = st.wHour;
	result->min = st.wMinute;
	result->sec = st.wSecond;
	result->ms = st.wMilliseconds;
#else

	time_t tt;
    struct timeval tv;
    struct tm *timeinfo;
    long tv_ms = 0, tv_us= 0;
    time(&tt);
    // gmtime_r(&tt, timeinfo);
	timeinfo = gmtime(&tt);
	// std::cout << timeinfo.tm_year << timeinfo.tm_mon << timeinfo.tm_mday << timeinfo.tm_hour << timeinfo.tm_min << timeinfo.tm_sec << std::endl;
    gettimeofday(&tv, NULL);
	tv_ms = tv.tv_usec / 1000;
    tv_us = tv.tv_usec % 1000;

	result->year = timeinfo->tm_year + 1900;
	result->month = timeinfo->tm_mon + 1;
	result->day = timeinfo->tm_mday;
	result->hour = timeinfo->tm_hour;
	result->min = timeinfo->tm_min;
	result->sec = timeinfo->tm_sec;
	result->ms = tv_ms;
	
#endif
}

static int getCurrentThreadId() {
#ifdef WIN32
	return GetCurrentThreadId();
#else
	return 0;
#endif
}


static void _format_help(
    std::ostringstream& os, const std::string& format, std::size_t offset)
{
	os << format.substr(offset, format.size() - offset);
}
 
template <class T, class... Args>
static void _format_help(
	std::ostringstream& os, const std::string& format, std::size_t offset, T arg, Args...args)
{
	std::size_t off = format.find("{}", offset);
	if (off == std::string::npos) {
		os << format.substr(offset, format.size() - offset);
		return;
	}
	os << format.substr(offset, off - offset) << arg;
	_format_help(os, format, off + 2, args...);
}

template <class... Args>
std::string myFormat(const std::string& format, Args... args)
{
	std::ostringstream os;
	_format_help(os, format, 0, args...);
	return std::move(os.str());
}

void _func_log_print(const char * format, ...)
{
	char buffer[1024] = { 0 };
	st_time t;
	int len = 0;
	va_list args;
	
	// std::cout << t.year << t.month << t.day << t.hour << t.min << t.sec << t.ms << std::endl;
	getTime(&t);
	int threadId = getCurrentThreadId();

	// printf_s("[%4d-%d-%d %02d:%02d:%02d.%03d][", t.year, t.month, t.day, t.hour, t.min, t.sec, t.ms);
	// printf_s("%d", threadId);
	// printf_s("]");
	
	std::cout << myFormat("[{}-{}-{} {}:{}:{}.{}][{}]", t.year, t.month, t.day, t.hour, t.min, t.sec, t.ms, threadId);

	va_start(args, format);
	//printf(format, args);
	vsnprintf(buffer+len, sizeof(buffer)-len, format, args);
	va_end(args);

	// printf_s(buffer);
	std::cout << buffer;
}

void _func_log_file(FILE* fp, const char *format, ...) {

	char buffer[1024] = { 0 };
	st_time t;
	int len = 0;
	va_list args;

	getTime(&t);

	len = _snprintf(buffer, sizeof(buffer), "[%4d-%d-%d %02d:%02d:%02d.%03d] ", t.year, t.month, t.day, t.hour, t.min, t.sec, t.ms);

	va_start(args, format);
	// printf_s(format, args);
	std::cout << myFormat(format, args);
	va_end(args);
}