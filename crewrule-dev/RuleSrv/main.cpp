/*
* Copyright (c) 2014 Cesanta Software Limited
* All rights reserved
*/
//#pragma comment( linker, "/subsystem:windows /entry:mainCRTStartup" )
#include <iostream>
#include "mongoose.h"
#include "WebSrv.h"
#include "RuleEngineHandler.h"
#include "config.h"
#include "configParam.h"
#include "Log/Logger.h"
using namespace std;

#ifdef WIN32
#include <windows.h>
#include <direct.h>
#define GetCurrentDir _getcwd
#define PATH_SEPARATOR '\\'
#else
#include <unistd.h>
#define GetCurrentDir getcwd
#define stricmp strcasecmp
#define PATH_SEPARATOR '/'
#endif

//20190523 ain, mantis#5276, 编译时间
const char buildTime[100] = "Build time: " __DATE__ " " __TIME__ ".";
#ifndef CREWRULE_GITHASH
#define CREWRULE_GITHASH "N/A"
#endif
const char crewRuleGitHash[128] = CREWRULE_GITHASH;

bool isCommandLineParamExist(char* param, int argc, char* argv[]);

extern int runTests(const char* szRootPath);

int main(int argc, char *argv[]) {
	//20191021, ain, mantis#6898, 按命令行参数是否包含 'hide'决定是否隐藏黑窗, 并重定向日志 stdout到文件
	if (isCommandLineParamExist("hide", argc, argv)) {
#ifdef _WIN32
		::ShowWindow(::GetConsoleWindow(), 0);//hide
#endif
		Logger::getRuleLogger()->info("Hide console");

		//运行时重定向stdout到 ruleSrv.log
		char logFileName[] = "ruleSrv.log";
		if (freopen(logFileName, "a+", stdout) == nullptr) {
			Logger::getRuleLogger()->error("Failed to ruleSrv.log");
		}
		else {
			Logger::getRuleLogger()->info("to ruleSrv.log");
		}
	}
	else {
#ifdef _WIN32
		// 获取控制台输入句柄  
		HANDLE hConsole = GetStdHandle(STD_INPUT_HANDLE);

		// 获取控制台模式  
		DWORD mode;
		GetConsoleMode(hConsole, &mode);

		// 禁用鼠标输入模式  
		SetConsoleMode(hConsole, mode & ~(ENABLE_PROCESSED_INPUT | ENABLE_QUICK_EDIT_MODE));
#endif
	}

	Logger::getRuleLogger()->info("{}", buildTime);
	Logger::getRuleConsoleLogger()->info("{}", buildTime);
    Logger::getRuleLogger()->info("Rule githash: {}", crewRuleGitHash);
	Logger::getRuleConsoleLogger()->info("Rule githash: {}", crewRuleGitHash);
	//read config file
	string exePathStr = argv[0];
	size_t pos = exePathStr.rfind(PATH_SEPARATOR);
	string dataDirStr = exePathStr.substr(0, pos + 1);
	string configFile = dataDirStr + "RuleServiceConfig.txt";
	if (!checkFileExist(configFile)) {
		configFile = "RuleServiceConfig.txt";
		if (!checkFileExist(configFile)) {
			Logger::getRuleLogger()->error("ERROR: config file 'RuleServiceConfig.txt' not found");
			return -1;
		}
	}

	//配置方式 FILE/ COMMAND_ARG
	//1) 命令行指定参数，或配置文件指定参数
	//   由命令行参数决定，若带有命令行参数则按命令行参数解析
	//   命令行单机版07： ruleSrv.exe 8000 db 121.40.48.189:10000 CREW_DEV_07 rois07 
	//   命令行server版： ruleSrv.exe 8000 server 121.40.48.189:8083
	//   命令行test版：   ruleSrv.exe test rule_path
	//   从配置文件解析： ruleSrv.exe
	//2) 文件，可为 Database_connections.txt/ RuleServiceConfig.txt
	DATA_SOURCE_CONFIG& config = DATA_SOURCE_CONFIG::getInstance();
	if (argc >= 5 && 0 == strncmp(argv[2], "db", strlen("db"))) {
		config.configBy = DATA_SOURCE_CONFIG::COMMAND_LINE_ARG;
		config.dataSourceType = "db";
		char * port = argv[1];
		char * sourceType = argv[2];
		char * dbUrl = argv[3];
		char * dbUser = argv[4];
		char * dbPwd = argv[5];
		strncpy(g_port, port, sizeof(g_port) - 1);
		strncpy(g_dataSource, sourceType, sizeof(g_dataSource) - 1);
		strncpy(g_connStr, dbUrl, sizeof(g_connStr) - 1);
		strncpy(g_username, dbUser, sizeof(g_username) - 1);
		strncpy(g_password, dbPwd, sizeof(g_password) - 1);
		config.dataSourceType = sourceType;
	}
	else if (argc == 4 && 0 == strncmp(argv[2], "server", strlen("server"))) {
		char * port = argv[1];
		char * sourceType = argv[2];
		char * url = argv[3];
		strncpy(g_port, port, sizeof(g_port) - 1);
		strncpy(g_dataSource, sourceType, sizeof(g_dataSource) - 1);
		strncpy(g_dataSourceServerUtl, url, sizeof(g_dataSourceServerUtl) - 1);
	}
	else if (argc == 3 && 0 == strncmp(argv[1], "test", strlen("test"))) {
		char* szPath = argv[2];
		runTests(szPath);
		return 0;
	}
	else {
		config.configBy = DATA_SOURCE_CONFIG::FILE;

		Config config(configFile);
		if (!config.isExist()) {
			char dirBuf[FILENAME_MAX] = { 0 };
			if (GetCurrentDir(dirBuf, sizeof(dirBuf)) == nullptr) {
				Logger::getRuleLogger()->error("Fail to get current directory.");
			}
			string currentDir(dirBuf);
			configFile = currentDir + "/" + "RuleServiceConfig.txt";
			config = Config(configFile);
		}
		if (!config.isExist()) {
			Logger::getRuleLogger()->warn("WARN: config file '{}' not found, use default config value ( g_username@{}:{}).", configFile, g_connStr, g_port);
		}
		else {

			string DatabaseURL = config.pString("DatabaseURL");
			string DatabaseUsername = config.pString("DatabaseUsername");
			string DatabasePassword = config.pString("DatabasePassword");
			string RuleEngineDir = config.pString("RuleEngineDir");
			string portStr = config.pString("Port");
			string dataSource = config.pString("data_source"); //db or server
			string dataSourceServerUrl = config.pString("data_source_server");

			strcpy(g_connStr, DatabaseURL.c_str());
			strcpy(g_username, DatabaseUsername.c_str());
			strcpy(g_password, DatabasePassword.c_str());
			strcpy(g_rootDir, RuleEngineDir.c_str());
			strcpy(g_port, portStr.c_str());
			strcpy(g_dataSource, dataSource.c_str());
			strcpy(g_dataSourceServerUtl, dataSourceServerUrl.c_str());
		}
	}

	if (g_rootDir[0] == '\0'){
		Logger::getRuleLogger()->error("invaild config fail,RuleEngineDir read fail");
		return -1;
	}

	Logger::getRuleLogger()->info("DataSource:"); 
	Logger::getRuleConsoleLogger()->info("DataSource:");
	
	if (config.configBy == DATA_SOURCE_CONFIG::FILE) {
		Logger::getRuleLogger()->info("\tBY FILE: {}", configFile.c_str());
		Logger::getRuleConsoleLogger()->info("\tBY FILE: {}", configFile.c_str());
	}
	else
		Logger::getRuleLogger()->info("\tBY CommandLine");
	for (auto& c : config.dataSourceType) {
		c = tolower(c);
	}
	if (0 == stricmp(g_dataSource, "db"))
		Logger::getRuleLogger()->info("\t{}@{}", g_username, g_connStr);
	else {
		Logger::getRuleLogger()->info("\t{}", g_dataSourceServerUtl);
		Logger::getRuleConsoleLogger()->info("\t{}", g_dataSourceServerUtl);
	}

	//test usage
	Logger::getRuleLogger()->info("Test usage:"); 
	Logger::getRuleConsoleLogger()->info("Test usage:");
	Logger::getRuleLogger()->info("\topen in broswer http://127.0.0.1:{}/test", g_port);
	Logger::getRuleConsoleLogger()->info("\topen in broswer http://127.0.0.1:{}/test", g_port);
	Logger::getRuleLogger()->info("\tThis will read and exec json files in inbox one by one.");
	Logger::getRuleConsoleLogger()->info("\tThis will read and exec json files in inbox one by one.");

	try {
		//rule_engine_init();
		web_srv_start();
	}
	catch (std::exception& e) {
		Logger::getRuleLogger()->error("Exception: {}", e.what());
	}
	catch (...) {
		Logger::getRuleLogger()->error("Exception: general");
	}
	Logger::getRuleLogger()->info("done");
	//getchar();
	return 0;
}

//从命令行检查参数, 若param存在返回true, 不存在返回false
bool isCommandLineParamExist(char* param, int argc, char* argv[]) {
	for (int i = 0; i < argc; i++) {
		if (0 == stricmp(param, argv[i]))
			return true;
	}
	return false;
}