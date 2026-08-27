#include "Logger.h"

#include <spdlog/sinks/stdout_color_sinks.h>
#include <spdlog/common.h>
#include <spdlog/sinks/rotating_file_sink.h>
#include <spdlog/sinks/dup_filter_sink.h>
#include <iostream>

//#define SPDLOG_ACTIVE_LEVEL SPDLOG_LEVEL_TRACE//必须定义这个宏,才能输出文件名和行号

std::shared_ptr<spdlog::logger> Logger::ruleLogger = nullptr;

std::shared_ptr<spdlog::logger> Logger::ruleConsoleLogger = nullptr;

void Logger::initLog() {
    try
    {
        //文件sink
        auto file_sink = std::make_shared<spdlog::sinks::rotating_file_sink_mt>("logs/rule.log", 1024 * 1024 * 10, 5);
        file_sink->set_level(spdlog::level::debug);
        file_sink->set_pattern("[%Y-%m-%d %H:%M:%S.%e][%l][%t] %v");//%t thread

        //控制台sink
        auto console_sink = std::make_shared<spdlog::sinks::stdout_color_sink_mt>();
        console_sink->set_level(spdlog::level::err);
        //console_sink->set_pattern("[%Y-%m-%d %H:%M:%S.%e] [%l] [%v]");
        console_sink->set_pattern("[%H:%M:%S] %v");

        //控制台过滤重复日志
        auto console_dup_filter = std::make_shared<spdlog::sinks::dup_filter_sink_mt>(std::chrono::seconds(5));
        console_dup_filter->add_sink(console_sink);
        console_dup_filter->add_sink(file_sink);

        std::vector<spdlog::sink_ptr> sinks;
        //sinks.push_back(console_sink);
        sinks.push_back(console_dup_filter);
        //sinks.push_back(file_sink);

        ruleLogger = std::make_shared<spdlog::logger>("ruleLog", begin(sinks), end(sinks));
        ruleLogger->set_level(spdlog::level::debug);
        spdlog::register_logger(ruleLogger);

        spdlog::set_error_handler([](const std::string& msg) {
            std::cerr << "Log error: " << msg << std::endl;
        });

        //定期刷新日志缓冲区
        spdlog::flush_every(std::chrono::seconds(1));
        //warn级别直接写入日志
        spdlog::flush_on(spdlog::level::info);
    }
    catch (const spdlog::spdlog_ex& ex)
    {
        std::cout << "Log initialization failed: " << ex.what() << std::endl;
    }

}

void Logger::initConsoleLog() {
    try
    {

        //控制台sink
        auto console_sink = std::make_shared<spdlog::sinks::stdout_color_sink_mt>();
        console_sink->set_level(spdlog::level::info);
        console_sink->set_pattern("[%H:%M:%S] %v");

        //控制台过滤重复日志
        auto console_dup_filter = std::make_shared<spdlog::sinks::dup_filter_sink_mt>(std::chrono::seconds(5));
        console_dup_filter->add_sink(console_sink);

        std::vector<spdlog::sink_ptr> sinks;
        sinks.push_back(console_dup_filter);

        ruleConsoleLogger = std::make_shared<spdlog::logger>("ruleConsoleLog", begin(sinks), end(sinks));
        ruleConsoleLogger->set_level(spdlog::level::debug);

    }
    catch (const spdlog::spdlog_ex& ex)
    {
        std::cout << "Log initialization failed: " << ex.what() << std::endl;
    }

}


std::shared_ptr<spdlog::logger>& Logger::getRuleLogger() {
    if (ruleLogger == nullptr) {
        initLog();
    }
	return ruleLogger;
}

std::shared_ptr<spdlog::logger>& Logger::getRuleConsoleLogger() {
    if (ruleConsoleLogger == nullptr) {
        initConsoleLog();
    }
    return ruleConsoleLogger;
}

