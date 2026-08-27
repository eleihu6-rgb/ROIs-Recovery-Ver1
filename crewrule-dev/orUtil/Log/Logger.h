#ifndef _ORUTIL_LOGGER_H_
#define _ORUTIL_LOGGER_H_

#include "spdlog/spdlog.h"

class Logger {

public:
	static void initLog();

	static void initConsoleLog();

	static std::shared_ptr<spdlog::logger>& getRuleLogger();

	static std::shared_ptr<spdlog::logger>& getRuleConsoleLogger();

 
private:
	static std::shared_ptr<spdlog::logger> ruleLogger;

	static std::shared_ptr<spdlog::logger> ruleConsoleLogger;
};

#endif //_ORUTIL_LOGGER_H_