#ifndef WIN32
#define _snprintf	snprintf
#define stricmp strcasecmp
#endif

#include <string>
#ifdef MONGOOSE
#include "mongoose.h"
#else
#include "./HttpController.h"
#include "./HttpComponent.h"
#include "oatpp/network/Server.hpp"
#include <iostream>
#endif
#include "WebSrv.h"
#include "RuleEngineHandler.h"
#include "configParam.h"
#include "WebSrvSessionMgr.h"
#include <iostream>
#include <algorithm>
#include "SessionLock.h"
#include "OrLog.h"
#include "UtilFunc.h"
#include "JsonPairing.h"
#include "FileDirUtil.h"
#include "Log/Logger.h"

#ifdef MONGOOSE
static bool g_ruleSrv_continue = true;
static struct mg_serve_http_opts s_http_server_opts = { 0 };
static WebSrvSessionMgr g_sessionMgr;
bool getParamFromHttpMsg(struct mg_connection *nc, struct http_message *hm, const char * name, char * buf, int bufsize, int * realSize);

//------------------ Send HTTP result ------------------

void HANDLE_RESULT(struct mg_connection *nc, struct http_message *hm, ErrorContext * errCtx, stringstream& responseData) {
	char sessionName[256] = { 0 };
	getParamFromHttpMsg(nc, hm, "sessionName", sessionName, sizeof(sessionName) - 1, nullptr);
	mg_printf(nc, "%s", "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n"); 
	if (errCtx->errorCode == 0) {	
		mg_printf_http_chunk(nc, "{ \"result\": \"success\", \"data\": %s}", responseData.str().c_str()); 
	}
	else {
		if (g_sessionMgr.isSessionExist(sessionName))
			mg_printf_http_chunk(nc, "{ \"result\": \"fail\", \"errorCode\": %d, \"errorMsg\": \"%s\"}", errCtx->errorCode, errCtx->errorMsgBuf);
		else
			mg_printf_http_chunk(nc, "{ \"result\": \"fail\", \"errorCode\": %d, \"errorMsg\": \"session[%s] not exist\"}", errCtx->errorCode, sessionName);
	}
	mg_send_http_chunk(nc, "", 0);
}
void HANDLE_RESULT(struct mg_connection *nc, struct http_message *hm, ErrorContext * errCtx) {
	char sessionName[256] = { 0 };
	getParamFromHttpMsg(nc, hm, "sessionName", sessionName, sizeof(sessionName) - 1, nullptr);
	mg_printf(nc, "%s", "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n");
	if (errCtx->errorCode == 0) {
		mg_printf_http_chunk(nc, "{ \"result\": \"success\"}");
	}
	else {
		if (g_sessionMgr.isSessionExist(sessionName))
			mg_printf_http_chunk(nc, "{ \"result\": \"fail\", \"errorCode\": %d, \"errorMsg\": \"%s\"}", errCtx->errorCode, errCtx->errorMsgBuf);
		else
			mg_printf_http_chunk(nc, "{ \"result\": \"fail\", \"errorCode\": %d, \"errorMsg\": \"session[%s] not exist\"}", errCtx->errorCode, sessionName);
	}
	mg_send_http_chunk(nc, "", 0);
}
//---------------- Send HTTP result end ----------------

//************************************************************
//获取http参数
//realSize: 返回需要的缓冲大小，如果 realSize > bufsize，则说明缓冲不足
//************************************************************
//是否处于 TEST中，若是则从 g_test_file获取 inbox文件名
#define TEST_HTTP_PARM_BUF_SIZE 1024
static bool g_is_test = false;  
static char g_test_http_param[TEST_HTTP_PARM_BUF_SIZE] = { 0 };
bool getParamFromHttpMsg(struct mg_connection *nc, struct http_message *hm, const char * name, char * buf, int bufsize, int * realSize) {
	char method[10] = { 0 };
	size_t size = 0;
	strncpy(method, hm->method.p, hm->method.len);
	if (g_is_test) {
		int len = 0;
		if (buf) {
			if (0 == strncmp("sessionName", name, strlen("sessionName"))) {
				strncpy(buf, "test_session", bufsize - 1);
				len = (int)strlen("test_session");
			}
			else if ( 0 == strncmp("transactionId", name, strlen("transactionId")) || 0 == strncmp("status", name, strlen("status")) ) {
				len = 0;
			}
			else {
				//若url中找不到param，则按 g_test_http_param获取参数
				mg_get_http_var(&hm->query_string, name, buf, bufsize);
				if (buf[0] == '\0') {
					strncpy(buf, g_test_http_param, bufsize - 1);
					len = (int)strlen(g_test_http_param);
				}
			}

		}
		if (realSize)
			*realSize = len;
	}
	else if (0 == stricmp(method, "Get")) {
		mg_get_http_var(&hm->query_string, name, buf, bufsize);
	}
	else {
		if (buf)
			size = mg_get_http_var(&hm->body, name, buf, bufsize);
	}
	if (realSize)
		*realSize = (int)hm->body.len;
	if (size == 0)
		return false;
	else
		return true;
}

/**
* 判断操作是否仅作用于当前请求，此时通过Session全局缓存数据复制临时缓存进行操作
*/
bool isRequestScope(const std::string fileName, const std::string requestSysName, const std::string type) {
	if (requestSysName == "server" && string::npos != type.find("check")) {
		return true;
	}

	//if (requestSysName == "server" 
	//	&& (string::npos != fileName.find("addFlight") || string::npos != fileName.find("syncRuleSrv")) ) {
	//	return true;
	//}

	return false;
}

//************************************************************
//功能接口：加载场景数据
//************************************************************
static void handle_load_scenario(struct mg_connection *nc, struct http_message *hm) {

	ErrorContext errCtx = { 0 };
	char baseIdsBuf[100] = { 0 };
	char rankIdsBuf[100] = { 0 };
	char fleetIdsBuf[100] = { 0 };
	char scenarioStr[21] = { 0 };
	char requestSysName[64] = { 0 };
	long long scenarioId = 0;
	char buf[256] = { 0 };
	time_t startDtLoc = 0;
	time_t endDtLoc = 0;
	int ret = 0;

	getParamFromHttpMsg(nc, hm, "sys", requestSysName, sizeof(requestSysName), nullptr);

	//check session
	char sessionName[256] = { 0 };
	getParamFromHttpMsg(nc, hm, "sessionName", sessionName, sizeof(sessionName) - 1, nullptr);
	if (g_sessionMgr.isSessionExist(sessionName)) {
		//_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "handle_load_scenario failed, session '%s' already exist", sessionName);
		//Logger::getRuleLogger()->error("handle_load_scenario failed, session '" + (string)sessionName + "' not exist");
		g_sessionMgr.destroySession(sessionName);
		Logger::getRuleLogger()->warn("WARNING:　session {} is already exist, destory it!", sessionName);
	}
	g_sessionMgr.addSession(sessionName);
	
	try{
		{
			SessionLock sessionLock(&g_sessionMgr, sessionName);  //lock on constrution, unlock on obj at the end of scope
			getParamFromHttpMsg(nc, hm, "scenarioId", scenarioStr, sizeof(scenarioStr), nullptr);
			scenarioId = atoll(scenarioStr);

			char jsonFile[256] = { 0 };
			getParamFromHttpMsg(nc, hm, "file", jsonFile, sizeof(jsonFile), nullptr);

			/* 调用RuleEngine */
			if (strlen(scenarioStr) > 0)
				ret = rule_engine_load(&errCtx, sessionName, g_sessionMgr.getData(sessionName), g_sessionMgr.getRuleEngine(sessionName), scenarioId, jsonFile);
			else
				ret = rule_engine_load_by_csv_file(&errCtx, sessionName, g_sessionMgr.getData(sessionName), g_sessionMgr.getRuleEngine(sessionName), jsonFile);
			//mantis#2085, free db connection
			//cleanupDBConnection(PairingDBContext::getDbConnection());			
		}

		/* 打印http response */
		HANDLE_RESULT(nc, hm, &errCtx);
		if (ret != 0) {
			//如果load 失败，则清空dbData
			g_sessionMgr.destroySession(sessionName);
		}
	}
	catch (char* ex) {
		Logger::getRuleLogger()->error("handle_load_scenario exception:{}", ex);
	}
	catch (std::string& ex) {
		Logger::getRuleLogger()->error("handle_load_scenario exception:{}", ex);
	}
	catch (std::exception& ex) {
		Logger::getRuleLogger()->error("handle_load_scenario exception:{}", ex.what());
	}
	catch (...) {
		Logger::getRuleLogger()->error("handle_load_scenario general exception");
	}
}


static bool is_session_data_loaded(const char * sessionName) {
	if (! g_sessionMgr.isSessionExist(sessionName)) {
		return false;
	}
	return ! g_sessionMgr.getData(sessionName)->crewIdMap.empty();
}

static bool load_scenario_csv(const char * sessionName, const char * filename) {

	ErrorContext errCtx = { 0 };
	char filepath[1024] = { 0 };
	bool ret = false;

	Logger::getRuleLogger()->info("---------------------------");
	Logger::getRuleLogger()->info("[{}][load scenario] {}\n", sessionName, filename);

	//check session
	if (g_sessionMgr.isSessionExist(sessionName)) {
		//_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "handle_load_scenario failed, session '%s' already exist", sessionName);
		//Logger::getRuleLogger()->error("handle_load_scenario failed, session '" + (string)sessionName + "' not exist");
		g_sessionMgr.destroySession(sessionName);
		Logger::getRuleLogger()->warn("WARNING:　session {} is already exist, destory it!", sessionName);
	}
	g_sessionMgr.addSession(sessionName);

	try{
		SessionLock sessionLock(&g_sessionMgr, sessionName);  //lock on constrution, unlock on obj at the end of scope
		SharedPtr<CrewDataContext> dbData = g_sessionMgr.getData(sessionName);
		dbData->reset();
		_snprintf(filepath, sizeof(filepath) - 1, "%s/inbox/roster/%s", g_rootDir, filename);
		dbData->loadDataCsv(filepath);

		//dbData.loadData后重新 ruleEngine.setDataContext()，以重新执行初始化（如 rankList初始化 Index2DArray）
		g_sessionMgr.getRuleEngine(sessionName)->setDataContext(dbData);
		ret = true;
	}
	catch (char* ex) {
		Logger::getRuleLogger()->error("load_scenario_csv exception:{}", ex);
	}
	catch (std::string& ex) {
		Logger::getRuleLogger()->error("load_scenario_csv exception:{}", ex);
	}
	catch (std::exception& ex) {
		Logger::getRuleLogger()->error("load_scenario_csv exception:{}", ex.what());
	}
	catch (...) {
		Logger::getRuleLogger()->error("load_scenario_csv general exception");
	}
	return false;
}

static void load_debug_crews_json(const char * sessionName, const char * filename) {
	//20181218 ain, OP#1966, 读取json文件 'DebugCrews.txt', 并按其中crewId内容删减 dbData->crewList

	if (! g_sessionMgr.isSessionExist(sessionName)) {
		return;
	}
	char filepath[1024] = { 0 };
	_snprintf(filepath, sizeof(filepath) - 1, "%s/inbox/roster/%s", g_rootDir, filename);
	// read 'DebugCrews.txt'
	rapidjson::Document document;
	vector<string> debugCrews;
	int ret = readFile_CrewIdList(filepath, debugCrews, document);
	if (ret != 0 && ret != ERR_FILE_FAIL) {
		const char* msg = readFile_getLastErrMsg();
		Logger::getRuleLogger()->error("ERROR: read file '{}' fail {}", filename, msg ? msg : "");
		return;
	}
	if (debugCrews.empty())
		return;
	cout << "DEBUG crews=";
	for (auto& str : debugCrews)
		cout << str << ", ";
	cout << endl;
	// reset dbData->crewList
	SharedPtr<CrewDataContext> dbData = g_sessionMgr.getData(sessionName);
	dbData->reset();
	map<string, bool> debugCrewIdMap;
	for (auto& crewId : debugCrews) {
		debugCrewIdMap[crewId] = true;
	}
	vector<SharedPtr<CREW>> dbgCrewList;
	for (string crewId : debugCrews) {
		if (debugCrewIdMap.find(crewId) != debugCrewIdMap.end())
			dbgCrewList.push_back(dbData->crewIdMap[crewId]);
	}
	dbData->crewList = dbgCrewList;
}

//************************************************************
//功能接口：检查Pairing法规
//************************************************************
static void handle_check_pairing(struct mg_connection *nc, struct http_message *hm) {

	ErrorContext errCtx = { 0 };
	char jsonName[100] = { 0 };
	char sessionStr[256] = { 0 };
	char requestSysName[64] = { 0 };
	int ret = 0;

	//check session
	char sessionName[256] = { 0 };
	getParamFromHttpMsg(nc, hm, "sessionName", sessionName, sizeof(sessionName) - 1, nullptr);
	if (!g_sessionMgr.isSessionExist(sessionName)) {
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "change_pairing failed, session '%s' not exist", sessionName);
		Logger::getRuleLogger()->error("change_pairing failed, session '" + (string)sessionName + "' not exist");
	}

	getParamFromHttpMsg(nc, hm, "file", jsonName, sizeof(jsonName), nullptr);
	getParamFromHttpMsg(nc, hm, "sessionName", sessionStr, sizeof(sessionStr), nullptr);
	getParamFromHttpMsg(nc, hm, "sys", requestSysName, sizeof(requestSysName), nullptr);

	try {
		SessionLock sessionLock(&g_sessionMgr, sessionName);  //lock on constrution, unlock on obj at the end of scope

		/* 调用RuleEngine */
		ret = rule_engine_check(&errCtx, sessionName, g_sessionMgr.getData(sessionName), g_sessionMgr.getRuleEngine(sessionName), jsonName, sessionStr);

		/* 打印http response */
		HANDLE_RESULT(nc, hm, &errCtx);
	}
	catch (char* ex) {
		Logger::getRuleLogger()->error("handle_check_pairing exception:{}", ex);
	}
	catch (std::string& ex) {
		Logger::getRuleLogger()->error("handle_check_pairing exception:{}", ex);
	}
	catch (std::exception& ex) {
		Logger::getRuleLogger()->error("handle_check_pairing exception:{}", ex.what());
	}
	catch (...) {
		Logger::getRuleLogger()->error("handle_check_pairing general exception");
	}
}


static void handle_check_crew(struct mg_connection *nc, struct http_message *hm) {

	ErrorContext errCtx = { 0 };
	char jsonName[100] = { 0 };
	char idcrew[100] = { 0 };
	char requestSysName[64] = { 0 };
	int ret = 0;

	//check session
	char sessionName[256] = { 0 };
	getParamFromHttpMsg(nc, hm, "sessionName", sessionName, sizeof(sessionName) - 1, nullptr);
	if (!g_sessionMgr.isSessionExist(sessionName)) {
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "check_crew failed, session '%s' not exist", sessionName);
		Logger::getRuleLogger()->error("check_crew failed, session '" + (string)sessionName + "' not exist");
		return;
	}

	getParamFromHttpMsg(nc, hm, "file", jsonName, sizeof(jsonName), nullptr);
	//getParamFromHttpMsg(nc, hm, "idcrew", idcrew, sizeof(idcrew));
	getParamFromHttpMsg(nc, hm, "sys", requestSysName, sizeof(requestSysName), nullptr);

	try {
		SessionLock sessionLock(&g_sessionMgr, sessionName);  //lock on constrution, unlock on obj at the end of scope

		/* 调用RuleEngine */
		ret = rule_engine_check_crew(&errCtx, sessionName, g_sessionMgr.getData(sessionName), g_sessionMgr.getRuleEngine(sessionName), jsonName);
		if (ret != 0) {
			Logger::getRuleLogger()->error(errCtx.errorMsgBuf);
			return;
		}
		/* 打印http response */
		HANDLE_RESULT(nc, hm, &errCtx);
	}
	catch (char* ex) {
		Logger::getRuleLogger()->error("handle_check_crew exception:{}", ex);
	}
	catch (std::string& ex) {
		Logger::getRuleLogger()->error("handle_check_crew exception:{}", ex);
	}
	catch (std::exception& ex) {
		Logger::getRuleLogger()->error("handle_check_crew exception:{}", ex.what());
	}
	catch (...) {
		Logger::getRuleLogger()->error("handle_check_crew general exception");
	}
}


static void handle_update_flight(struct mg_connection *nc, struct http_message *hm) {

	ErrorContext errCtx = { 0 };
	char fileName[100] = { 0 };
	char requestSysName[64] = { 0 };
	int jsonSize = 0;
	std::unique_ptr<char[]> jsonBuf = nullptr;
	int ret = 0;
	bool success = false;

	//check session
	char sessionName[256] = { 0 };
	getParamFromHttpMsg(nc, hm, "sessionName", sessionName, sizeof(sessionName) - 1, nullptr);
	if (!g_sessionMgr.isSessionExist(sessionName)) {
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "handle_update_list failed, session '%s' not exist", sessionName);
		Logger::getRuleLogger()->error("handle_update_list failed, session '" + (string)sessionName + "' not exist");
		return;
	}

	getParamFromHttpMsg(nc, hm, "sys", requestSysName, sizeof(requestSysName), nullptr);

	try {
		SessionLock sessionLock(&g_sessionMgr, sessionName);  //lock on constrution, unlock on obj at the end of scope

		//若参数为 json，则直接获取json内容
		//若参数为 file，则从文件读取json内容
		getParamFromHttpMsg(nc, hm, "json", nullptr, 0, &jsonSize);
		if (jsonSize > 0) {
			jsonBuf = std::make_unique<char[]>(jsonSize + 1);
			memset(jsonBuf.get(), 0, jsonSize + 1);
			success = getParamFromHttpMsg(nc, hm, "json", jsonBuf.get(), jsonSize, &jsonSize);
			if (!success) {
				Logger::getRuleLogger()->error("get json from http fail ");
				return;
			}
		}
		else {
			getParamFromHttpMsg(nc, hm, "file", fileName, sizeof(fileName), nullptr);
		}
		ret = rule_engine_update_filght(&errCtx, sessionName, g_sessionMgr.getData(sessionName), g_sessionMgr.getRuleEngine(sessionName), jsonBuf.get(), fileName);

		/* 打印http response */
		HANDLE_RESULT(nc, hm, &errCtx);
	}
	catch (char* ex) {
		Logger::getRuleLogger()->error("handle_update_flight exception:{}", ex);
	}
	catch (std::string& ex) {
		Logger::getRuleLogger()->error("handle_update_flight exception:{}", ex);
	}
	catch (std::exception& ex) {
		Logger::getRuleLogger()->error("handle_update_flight exception:{}", ex.what());
	}
	catch (...) {
		Logger::getRuleLogger()->error("handle_update_flight general exception");
	}
}

static void handle_try_pairing_on_crew(struct mg_connection *nc, struct http_message *hm) {

	ErrorContext errCtx = { 0 };
	char jsonName[100] = { 0 };
	char idcrew[100] = { 0 };
	char requestSysName[64] = { 0 };
	int ret = 0;

	//check session
	char sessionName[256] = { 0 };
	getParamFromHttpMsg(nc, hm, "sessionName", sessionName, sizeof(sessionName) - 1, nullptr);
	if (!g_sessionMgr.isSessionExist(sessionName)) {
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "try_pairing_on_crew failed, session '%s' not exist", sessionName);
		Logger::getRuleLogger()->error("try_pairing_on_crew failed, session '" + (string)sessionName + "' not exist");
		return;
	}

	getParamFromHttpMsg(nc, hm, "file", jsonName, sizeof(jsonName), nullptr);
	//getParamFromHttpMsg(nc, hm, "idcrew", idcrew, sizeof(idcrew));
	getParamFromHttpMsg(nc, hm, "sys", requestSysName, sizeof(requestSysName), nullptr);

	try {
		SessionLock sessionLock(&g_sessionMgr, sessionName);  //lock on constrution, unlock on obj at the end of scope

		/* 调用RuleEngine */
		ret = rule_engine_try_pairing_on_crew(&errCtx, sessionName, g_sessionMgr.getData(sessionName), g_sessionMgr.getRuleEngine(sessionName), jsonName);
		if (ret != 0) {
			Logger::getRuleLogger()->error(errCtx.errorMsgBuf);
			return;
		}
		/* 打印http response */
		HANDLE_RESULT(nc, hm, &errCtx);
	}
	catch (char* ex) {
		Logger::getRuleLogger()->error("handle_try_pairing_on_crew exception:{}", ex);
	}
	catch (std::string& ex) {
		Logger::getRuleLogger()->error("handle_try_pairing_on_crew exception:{}", ex);
	}
	catch (std::exception& ex) {
		Logger::getRuleLogger()->error("handle_try_pairing_on_crew exception:{}", ex.what());
	}
	catch (...) {
		Logger::getRuleLogger()->error("handle_try_pairing_on_crew general exception");
	}
}

static void handle_session_destroy(struct mg_connection *nc, struct http_message *hm) {

	ErrorContext errCtx = { 0 };
	char scenarioStr[21] = { 0 };
	char requestSysName[64] = { 0 };
	long long scenarioId = 0;
	int ret = 0;

	getParamFromHttpMsg(nc, hm, "sys", requestSysName, sizeof(requestSysName), nullptr);

	//check session
	char sessionName[256] = { 0 };
	getParamFromHttpMsg(nc, hm, "sessionName", sessionName, sizeof(sessionName) - 1, nullptr);
	if (!g_sessionMgr.isSessionExist(sessionName)) {
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "handle_session_destroy failed, session '%s' not exist", sessionName);
		Logger::getRuleLogger()->error("handle_session_destroy failed, session '" + (string)sessionName + "' not exist");
		return;
	}
	g_sessionMgr.destroySession(sessionName);

	//若清空session，则关闭ruleSrv
	if (g_sessionMgr.size() == 0) {
		Logger::getRuleLogger()->error("no session exist, ruleSrv END");
		g_ruleSrv_continue = false;
	}

	/* 打印http response */
	HANDLE_RESULT(nc, hm, &errCtx);
}

static void handle_test_scenario(struct mg_connection *nc, struct http_message *hm) {

	int ret = 0;
	string sessionName = "test";

	g_sessionMgr.addSession(sessionName);
	
	
	/* 调用RuleEngine */
	ret = rule_engine_test(g_sessionMgr.getData(sessionName), g_sessionMgr.getRuleEngine(sessionName));

	/* 打印http response */
	HANDLE_RESULT(nc, hm, 0);
	
}

//**************************************
//handle_update_list
//支持硬盘文件传递json、也支持http post方式传递json
//**************************************
static void handle_update_list(struct mg_connection *nc, struct http_message *hm) {

	ErrorContext errCtx = { 0 };
	char fileName[100] = { 0 };
	char requestSysName[64] = { 0 };
	char type[64] = { 0 };
	char requestTransactionId[64] = { 0 };
	char requestTransactionStatus[32] = { 0 };
	int jsonSize = 0;
	std::unique_ptr<char[]> jsonBuf = nullptr;
	int ret = 0;
	bool success = false;
	string op = "";

	//check session
	char sessionName[256] = { 0 };
	getParamFromHttpMsg(nc, hm, "sessionName", sessionName, sizeof(sessionName) - 1, nullptr);
	if (!g_sessionMgr.isSessionExist(sessionName)) {
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "handle_update_list failed, session '%s' not exist", sessionName);
		Logger::getRuleLogger()->error("handle_update_list failed, session '" + (string)sessionName + "' not exist");
		return;
	}

	getParamFromHttpMsg(nc, hm, "sys", requestSysName, sizeof(requestSysName), nullptr);
	getParamFromHttpMsg(nc, hm, "type", type, sizeof(type), nullptr);
	getParamFromHttpMsg(nc, hm, "transactionId", requestTransactionId, sizeof(requestTransactionId), nullptr);
	getParamFromHttpMsg(nc, hm, "status", requestTransactionStatus, sizeof(requestTransactionStatus), nullptr);

	
	//若参数为 json，则直接获取json内容
	//若参数为 file，则从文件读取json内容
	getParamFromHttpMsg(nc, hm, "json", nullptr, 0, &jsonSize);
	if (jsonSize > 0) {
		jsonBuf = std::make_unique<char[]>(jsonSize + 1);
		memset(jsonBuf.get(), 0, jsonSize + 1);
		success = getParamFromHttpMsg(nc, hm, "json", jsonBuf.get(), jsonSize, &jsonSize);
		if (!success) {
			Logger::getRuleLogger()->error("get json from http fail ");
			return;
		}
	}
	else {
		getParamFromHttpMsg(nc, hm, "file", fileName, sizeof(fileName), nullptr);
	}

	bool _isRequestScope = isRequestScope(fileName, requestSysName, type);
	shared_ptr<CrewDataContext> dbData = nullptr;
	shared_ptr<LegalityChecker> ruleEngine = nullptr;
	try {
		SessionLock sessionLock(&g_sessionMgr, sessionName, true, _isRequestScope, requestTransactionId);  //lock on constrution, unlock on obj at the end of scope
		dbData = g_sessionMgr.getData(sessionName, _isRequestScope, requestTransactionId);
		dbData->reset();
		dbData->setIsRequestScope(_isRequestScope);
		ruleEngine = g_sessionMgr.getRuleEngine(sessionName, _isRequestScope, requestTransactionId);
		if (_isRequestScope) {
			//创建临时缓存时，重新创建ruleEngine对象，并且重置dbData
			ruleEngine->setDataContext(dbData);
		}

	}
	catch (...) {
		//cout << "Exception: session[" << sessionName << "]" << endl;
		Logger::getRuleLogger()->error("general exception");
		return;
	}
	

	try {
		SessionLock sessionLock(&g_sessionMgr, sessionName, !_isRequestScope, _isRequestScope, requestTransactionId);  //lock on constrution, unlock on obj at the end of scope


		ret = rule_engine_update_list(&errCtx, sessionName, dbData, ruleEngine, jsonBuf.get(), fileName);

		
		/* 打印http response */
		HANDLE_RESULT(nc, hm, &errCtx);
	}
	catch (char* msg) {
		//cout << "Exception: session[" << sessionName << "]" << msg << endl;
		if (strToUpper(requestTransactionStatus) == "CLOSE") {
			g_sessionMgr.endTransaction(requestTransactionId);
		}
		Logger::getRuleLogger()->error("handle_update_list exception:{}", msg);
	}
	catch (const std::exception& ex) {
		if (strToUpper(requestTransactionStatus) == "CLOSE") {
			g_sessionMgr.endTransaction(requestTransactionId);
		}
		Logger::getRuleLogger()->error("handle_update_list exception:{}", ex.what());		
	}
	catch (...) {
		if (strToUpper(requestTransactionStatus) == "CLOSE") {
			g_sessionMgr.endTransaction(requestTransactionId);
		}
		//cout << "Exception: session[" << sessionName << "]" << endl;
		Logger::getRuleLogger()->error("handle_update_list general exception");
	}
	//必须在sessionLock析构后执行
	if (strToUpper(requestTransactionStatus) == "CLOSE") {
		g_sessionMgr.endTransaction(requestTransactionId);
	}
}

static void handle_get_rosters(struct mg_connection *nc, struct http_message *hm) {
	ErrorContext errCtx = { 0 };
	char idcrew[100] = { 0 };
	char requestSysName[64] = { 0 };
	int ret = 0;

	//check session
	char sessionName[256] = { 0 };
	getParamFromHttpMsg(nc, hm, "sessionName", sessionName, sizeof(sessionName) - 1, nullptr);
	if (!g_sessionMgr.isSessionExist(sessionName)) {
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "handle_get_rosters failed, session '%s' not exist", sessionName);
		Logger::getRuleLogger()->error("handle_get_rosters failed, session '" + (string)sessionName + "' not exist");
		return;
	}

	getParamFromHttpMsg(nc, hm, "sys", requestSysName, sizeof(requestSysName), nullptr);

	/* 调用RuleEngine */
	stringstream outputStream;
	getParamFromHttpMsg(nc, hm, "idcrew", idcrew, sizeof(idcrew), nullptr);
	ret = rule_engine_get_rosters(&errCtx, sessionName, g_sessionMgr.getData(sessionName), g_sessionMgr.getRuleEngine(sessionName), idcrew, outputStream);
	cout << outputStream.str() << endl;
	/* 打印http response */
	HANDLE_RESULT(nc, hm, &errCtx, outputStream);
	
}

static void handle_query_crew(struct mg_connection *nc, struct http_message *hm) {
	ErrorContext errCtx = { 0 };
	char idcrew[100] = { 0 };
	char requestSysName[64] = { 0 };
	int ret = 0;
	g_is_test = true;
	//check session
	char sessionName[256] = { 0 };
	getParamFromHttpMsg(nc, hm, "sessionName", sessionName, sizeof(sessionName) - 1, nullptr);
	if (!g_sessionMgr.isSessionExist(sessionName)) {
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "handle_get_rosters failed, session '%s' not exist", sessionName);
		Logger::getRuleLogger()->error("handle_get_rosters failed, session '" + (string)sessionName + "' not exist");
		return;
	}

	getParamFromHttpMsg(nc, hm, "sys", requestSysName, sizeof(requestSysName), nullptr);

	/* 调用RuleEngine */
	stringstream outputStream;
	getParamFromHttpMsg(nc, hm, "idcrew", idcrew, sizeof(idcrew), nullptr);
	ret = rule_engine_query_crew(&errCtx, sessionName, g_sessionMgr.getData(sessionName), idcrew, outputStream);
	cout << outputStream.str() << endl;
	/* 打印http response */
	HANDLE_RESULT(nc, hm, &errCtx, outputStream);
}

static void handle_update_crew(struct mg_connection *nc,struct http_message *hm){
	ErrorContext errCtx = { 0 };
	char csvName[100] = { 0 };
	char requestSysName[64] = { 0 };
	int ret = 0;

	//check session
	char sessionName[256] = { 0 };
	getParamFromHttpMsg(nc, hm, "sessionName", sessionName, sizeof(sessionName) - 1, nullptr);
	if (!g_sessionMgr.isSessionExist(sessionName)) {
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "update_crew failed, session '%s' not exist", sessionName);
		Logger::getRuleLogger()->error("update_crew failed, session '" + (string)sessionName + "' not exist");
		return;
	}
	getParamFromHttpMsg(nc, hm, "file", csvName, sizeof(csvName), nullptr);
	getParamFromHttpMsg(nc, hm, "sys", requestSysName, sizeof(requestSysName), nullptr);

	try {
		SessionLock sessionLock(&g_sessionMgr, sessionName);  //lock on constrution, unlock on obj at the end of scope

		/* 调用RuleEngine */		
		ret = rule_engine_update_crew(&errCtx, sessionName, g_sessionMgr.getData(sessionName), g_sessionMgr.getRuleEngine(sessionName), csvName);
		if (ret != 0) {
			Logger::getRuleLogger()->error(errCtx.errorMsgBuf);
			return;
		}
		/* 打印http response */
		HANDLE_RESULT(nc, hm, &errCtx);
	}
	catch (char* ex) {
		Logger::getRuleLogger()->error("handle_update_crew exception:{}", ex);
	}
	catch (std::string& ex) {
		Logger::getRuleLogger()->error("handle_update_crew exception:{}", ex);
	}
	catch (std::exception& ex) {
		Logger::getRuleLogger()->error("handle_update_crew exception:{}", ex.what());
	}
	catch (...) {
		Logger::getRuleLogger()->error("handle_update_crew general exception");
	}
}

static void handle_route_actual_rest(struct mg_connection *nc, struct http_message *hm){
	ErrorContext errCtx = { 0 };
	char fileName[100] = { 0 };
	char requestSysName[64] = { 0 };
	int jsonSize = 0;
	std::unique_ptr<char[]> jsonBuf = nullptr;
	bool success = false;
	int ret = 0;

	//check session
	char sessionName[256] = { 0 };
	getParamFromHttpMsg(nc, hm, "sessionName", sessionName, sizeof(sessionName) - 1, nullptr);
	if (!g_sessionMgr.isSessionExist(sessionName)) {
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "route_actual_rest failed, session '%s' not exist", sessionName);
		Logger::getRuleLogger()->error("route_actual_rest failed, session '" + (string)sessionName + "' not exist");
		return;
	}

	//若参数为 json，则直接获取json内容
	//若参数为 file，则从文件读取json内容
	getParamFromHttpMsg(nc, hm, "json", nullptr, 0, &jsonSize);
	if (jsonSize > 0) {
		jsonBuf = std::make_unique<char[]>(jsonSize + 1);
		memset(jsonBuf.get(), 0, jsonSize + 1);
		success = getParamFromHttpMsg(nc, hm, "json", jsonBuf.get(), jsonSize, &jsonSize);
		if (!success) {
			Logger::getRuleLogger()->error("get json from http fail ");
			return;
		}
	}
	else {
		getParamFromHttpMsg(nc, hm, "file", fileName, sizeof(fileName), nullptr);
	}
	getParamFromHttpMsg(nc, hm, "sys", requestSysName, sizeof(requestSysName), nullptr);

	try {
		SessionLock sessionLock(&g_sessionMgr, sessionName);  //lock on constrution, unlock on obj at the end of scope

		/* 调用RuleEngine */
		ret = rule_engine_route_actual_rest(&errCtx, sessionName, g_sessionMgr.getData(sessionName), g_sessionMgr.getRuleEngine(sessionName), jsonBuf.get(), fileName);
		if (ret != 0) {
			Logger::getRuleLogger()->error(errCtx.errorMsgBuf);
			return;
		}
		/* 打印http response */
		HANDLE_RESULT(nc, hm, &errCtx);
	}
	catch (char* ex) {
		Logger::getRuleLogger()->error("handle_route_actual_rest exception:{}", ex);
	}
	catch (std::string& ex) {
		Logger::getRuleLogger()->error("handle_route_actual_rest exception:{}", ex);
	}
	catch (std::exception& ex) {
		Logger::getRuleLogger()->error("handle_route_actual_rest exception:{}", ex.what());
	}
	catch (...) {
		Logger::getRuleLogger()->error("handle_route_actual_rest general exception");
	}
}


static void handle_crew_preference(struct mg_connection *nc, struct http_message *hm){
	ErrorContext errCtx = { 0 };
	char fileName[100] = { 0 };
	char requestSysName[64] = { 0 };
	int jsonSize = 0;
	std::unique_ptr<char[]> jsonBuf = nullptr;
	bool success = false;
	int ret = 0;

	//check session
	char sessionName[256] = { 0 };
	getParamFromHttpMsg(nc, hm, "sessionName", sessionName, sizeof(sessionName) - 1, nullptr);
	if (!g_sessionMgr.isSessionExist(sessionName)) {
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "crew_preference failed, session '%s' not exist", sessionName);
		Logger::getRuleLogger()->error("crew_preference failed, session '" + (string)sessionName + "' not exist");
		return;
	}

	//若参数为 json，则直接获取json内容
	//若参数为 file，则从文件读取json内容
	getParamFromHttpMsg(nc, hm, "json", nullptr, 0, &jsonSize);
	if (jsonSize > 0) {
		jsonBuf = std::make_unique<char[]>(jsonSize + 1);
		memset(jsonBuf.get(), 0, jsonSize + 1);
		success = getParamFromHttpMsg(nc, hm, "json", jsonBuf.get(), jsonSize, &jsonSize);
		if (!success) {
			Logger::getRuleLogger()->error("get json from http fail ");
			return;
		}
	}
	else {
		getParamFromHttpMsg(nc, hm, "file", fileName, sizeof(fileName), nullptr);
	}
	getParamFromHttpMsg(nc, hm, "sys", requestSysName, sizeof(requestSysName), nullptr);

	try {
		SessionLock sessionLock(&g_sessionMgr, sessionName);  //lock on constrution, unlock on obj at the end of scope

		/* 调用RuleEngine */
		ret = rule_engine_crew_preference(&errCtx, sessionName, g_sessionMgr.getData(sessionName), g_sessionMgr.getRuleEngine(sessionName), jsonBuf.get(), fileName);
		if (ret != 0) {
			Logger::getRuleLogger()->error(errCtx.errorMsgBuf);
			return;
		}
		/* 打印http response */
		HANDLE_RESULT(nc, hm, &errCtx);
	}
	catch (char* ex) {
		Logger::getRuleLogger()->error("handle_crew_preference exception:{}", ex);
	}
	catch (std::string& ex) {
		Logger::getRuleLogger()->error("handle_crew_preference exception:{}", ex);
	}
	catch (std::exception& ex) {
		Logger::getRuleLogger()->error("handle_crew_preference exception:{}", ex.what());
	}
	catch (...) {
		Logger::getRuleLogger()->error("handle_crew_preference general exception");
	}
}

static void handle_crew_entitlement(struct mg_connection *nc, struct http_message *hm){
	ErrorContext errCtx = { 0 };
	char fileName[100] = { 0 };
	char requestSysName[64] = { 0 };
	int jsonSize = 0;
	std::unique_ptr<char[]> jsonBuf = nullptr;
	bool success = false;
	int ret = 0;


	//check session
	char sessionName[256] = { 0 };
	getParamFromHttpMsg(nc, hm, "sessionName", sessionName, sizeof(sessionName) - 1, nullptr);
	if (!g_sessionMgr.isSessionExist(sessionName)) {
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "crew_entitlement failed, session '%s' not exist", sessionName);
		Logger::getRuleLogger()->error("crew_entitlement failed, session '" + (string)sessionName + "' not exist");
		return;
	}

	//若参数为 json，则直接获取json内容
	//若参数为 file，则从文件读取json内容
	getParamFromHttpMsg(nc, hm, "json", nullptr, 0, &jsonSize);
	if (jsonSize > 0) {
		jsonBuf = std::make_unique<char[]>(jsonSize + 1);
		memset(jsonBuf.get(), 0, jsonSize + 1);
		success = getParamFromHttpMsg(nc, hm, "json", jsonBuf.get(), jsonSize, &jsonSize);
		if (!success) {
			Logger::getRuleLogger()->error("get json from http fail ");
			return;
		}
	}
	else {
		getParamFromHttpMsg(nc, hm, "file", fileName, sizeof(fileName), nullptr);
	}

	getParamFromHttpMsg(nc, hm, "sys", requestSysName, sizeof(requestSysName), nullptr);

	try {
		SessionLock sessionLock(&g_sessionMgr, sessionName);  //lock on constrution, unlock on obj at the end of scope

		/* 调用RuleEngine */
		ret = rule_engine_crew_entitlement(&errCtx, sessionName, g_sessionMgr.getData(sessionName), g_sessionMgr.getRuleEngine(sessionName), jsonBuf.get(), fileName);
		if (ret != 0) {
			Logger::getRuleLogger()->error(errCtx.errorMsgBuf);
			return;
		}
		/* 打印http response */
		HANDLE_RESULT(nc, hm, &errCtx);
	}
	catch (char* ex) {
		Logger::getRuleLogger()->error("handle_crew_entitlement exception:{}", ex);
	}
	catch (std::string& ex) {
		Logger::getRuleLogger()->error("handle_crew_entitlement exception:{}", ex);
	}
	catch (std::exception& ex) {
		Logger::getRuleLogger()->error("handle_crew_entitlement exception:{}", ex.what());
	}
	catch (...) {
		Logger::getRuleLogger()->error("handle_crew_entitlement general exception");
	}
}

static void handle_crew_manday(struct mg_connection *nc, struct http_message *hm){
	ErrorContext errCtx = { 0 };
	char fileName[100] = { 0 };
	char requestSysName[64] = { 0 };
	int jsonSize = 0;
	std::unique_ptr<char[]> jsonBuf = nullptr;
	bool success = false;
	int ret = 0;

	//check session
	char sessionName[256] = { 0 };
	getParamFromHttpMsg(nc, hm, "sessionName", sessionName, sizeof(sessionName) - 1, nullptr);
	if (!g_sessionMgr.isSessionExist(sessionName)) {
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "crew_manday failed, session '%s' not exist", sessionName);
		Logger::getRuleLogger()->error("crew_manday failed, session '" + (string)sessionName + "' not exist");
		return;
	}

	//若参数为 json，则直接获取json内容
	//若参数为 file，则从文件读取json内容
	getParamFromHttpMsg(nc, hm, "json", nullptr, 0, &jsonSize);
	if (jsonSize > 0) {
		jsonBuf = std::make_unique<char[]>(jsonSize + 1);
		memset(jsonBuf.get(), 0, jsonSize + 1);
		success = getParamFromHttpMsg(nc, hm, "json", jsonBuf.get(), jsonSize, &jsonSize);
		if (!success) {
			Logger::getRuleLogger()->error("get json from http fail ");
			return;
		}
	}
	else {
		getParamFromHttpMsg(nc, hm, "file", fileName, sizeof(fileName), nullptr);
	}

	getParamFromHttpMsg(nc, hm, "sys", requestSysName, sizeof(requestSysName), nullptr);

	try {
		SessionLock sessionLock(&g_sessionMgr, sessionName);  //lock on constrution, unlock on obj at the end of scope

		/* 调用RuleEngine */
		ret = rule_engine_crew_manday(&errCtx, sessionName, g_sessionMgr.getData(sessionName), g_sessionMgr.getRuleEngine(sessionName), jsonBuf.get(), fileName);
		if (ret != 0) {
			Logger::getRuleLogger()->error(errCtx.errorMsgBuf);
			return;
		}
		/* 打印http response */
		HANDLE_RESULT(nc, hm, &errCtx);
	}
	catch (char* ex) {
		Logger::getRuleLogger()->error("handle_crew_manday exception:{}", ex);
	}
	catch (std::string& ex) {
		Logger::getRuleLogger()->error("handle_crew_manday exception:{}", ex);
	}
	catch (std::exception& ex) {
		Logger::getRuleLogger()->error("handle_crew_manday exception:{}", ex.what());
	}
	catch (...) {
		Logger::getRuleLogger()->error("handle_try_pairing_on_crew general exception");
	}
}

static void handle_update_basedata(struct mg_connection *nc, struct http_message *hm) {
	ErrorContext errCtx = { 0 };
	long long scenarioId = 0;
	char scenarioStr[21] = { 0 };
	char fileName[100] = { 0 };
	char requestSysName[64] = { 0 };
	bool success = false;
	int ret = 0;

	//check session
	char sessionName[256] = { 0 };
	getParamFromHttpMsg(nc, hm, "sessionName", sessionName, sizeof(sessionName) - 1, nullptr);
	if (!g_sessionMgr.isSessionExist(sessionName)) {
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "update_basedata failed, session '%s' not exist", sessionName);
		Logger::getRuleLogger()->error("update_basedata failed, session '" + (string)sessionName + "' not exist");
		return;
	}

	//从参数file文件中读取数据内容
	getParamFromHttpMsg(nc, hm, "file", fileName, sizeof(fileName), nullptr);

	getParamFromHttpMsg(nc, hm, "scenarioId", scenarioStr, sizeof(scenarioStr), nullptr);
	scenarioId = atoll(scenarioStr);

	getParamFromHttpMsg(nc, hm, "sys", requestSysName, sizeof(requestSysName), nullptr);

	try {
		//加载临时缓存数据
		shared_ptr<CrewDataContext> requestDbData = std::make_shared<CrewDataContext>();
		ret = rule_engine_load_data(requestDbData, scenarioId, fileName);
		if (ret != 0) {
			Logger::getRuleLogger()->error("load update basedata failed.");
			return;
		}

		SessionLock sessionLock(&g_sessionMgr, sessionName);  //lock on constrution, unlock on obj at the end of scope

		/* 调用RuleEngine */
		ret = rule_engine_update_basedata(&errCtx, sessionName, requestDbData, g_sessionMgr.getData(sessionName), g_sessionMgr.getRuleEngine(sessionName), scenarioId, fileName);
		if (ret != 0) {
			Logger::getRuleLogger()->error(errCtx.errorMsgBuf);
			return;			
		}
		/* 打印http response */
		HANDLE_RESULT(nc, hm, &errCtx);
	}
	catch (char* ex) {
		Logger::getRuleLogger()->error("handle_update_basedata exception:{}", ex);
	}
	catch (std::string& ex) {
		Logger::getRuleLogger()->error("handle_update_basedata exception:{}", ex);
	}	
	catch (std::exception& ex) {
		Logger::getRuleLogger()->error("handle_update_basedata exception:{}", ex.what());
	}
	catch (...) {
		Logger::getRuleLogger()->error("handle_update_basedata general exception");
	}
}

static void handle_update_scenario(struct mg_connection *nc, struct http_message *hm) {
	ErrorContext errCtx = { 0 };
	long long scenarioId = 0;
	char scenarioStr[21] = { 0 };
	char fileName[100] = { 0 };
	char requestSysName[64] = { 0 };
	bool success = false;
	int ret = 0;

	//check session
	char sessionName[256] = { 0 };
	getParamFromHttpMsg(nc, hm, "sessionName", sessionName, sizeof(sessionName) - 1, nullptr);
	if (!g_sessionMgr.isSessionExist(sessionName)) {
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "update_scenario failed, session '%s' not exist", sessionName);
		Logger::getRuleLogger()->error("update_scenario failed, session '" + (string)sessionName + "' not exist");
		return;		
	}

	//从参数file文件中读取数据内容
	getParamFromHttpMsg(nc, hm, "file", fileName, sizeof(fileName), nullptr);

	getParamFromHttpMsg(nc, hm, "scenarioId", scenarioStr, sizeof(scenarioStr), nullptr);
	scenarioId = atoll(scenarioStr);

	getParamFromHttpMsg(nc, hm, "sys", requestSysName, sizeof(requestSysName), nullptr);

	try {
		//加载临时缓存数据
		shared_ptr<CrewDataContext> requestDbData = std::make_shared<CrewDataContext>();
		ret = rule_engine_load_data(requestDbData, scenarioId, fileName);
		if (ret != 0) {
			Logger::getRuleLogger()->error("load update scenario data failed.");
			return;			
		}

		SessionLock sessionLock(&g_sessionMgr, sessionName);  //lock on constrution, unlock on obj at the end of scope

		/* 调用RuleEngine */
		ret = rule_engine_update_scenario(&errCtx, sessionName, requestDbData, g_sessionMgr.getData(sessionName), g_sessionMgr.getRuleEngine(sessionName), scenarioId, fileName);
		
		if (ret != 0) {
			Logger::getRuleLogger()->error(errCtx.errorMsgBuf);
			return;			
		}
		/* 打印http response */
		HANDLE_RESULT(nc, hm, &errCtx);
	}
	catch (char* ex) {
		Logger::getRuleLogger()->error("handle_update_scenario exception:{}", ex);
	}
	catch (std::string& ex) {
		Logger::getRuleLogger()->error("handle_update_scenario exception:{}", ex);
	}
	catch (std::exception& ex) {
		Logger::getRuleLogger()->error("handle_update_scenario exception:{}", ex.what());
	}
	catch (...) {
		Logger::getRuleLogger()->error("handle_update_scenario general exception");
	}
}

static void handle_test(struct mg_connection *nc, struct http_message *hm, bool alwaysReloadData=true) {

	ErrorContext errCtx = { 0 };
	char rootDir[256] = { 0 };
	char idcrew[100] = { 0 };
	int ret = 0;
	char * sessionName = "test_session";

	//当前处于测试状态，从 g_test_file中传递 inbox文件
	g_is_test = true;
	//mantis#2912, 修正 ruleSrv配置 RuleEngineDir未生效问题
	_snprintf(rootDir, sizeof(rootDir) - 1, "%s/inbox/roster", g_rootDir);

	vector<string> fileList = get_all_files_names_within_folder(rootDir);
	sort(fileList.begin(), fileList.end(), [](string a, string b)->bool{ return a.compare(b) < 0; });

	Logger::getRuleLogger()->info("/test START");
	for (string filename : fileList) {
		///TEST
		if (filename == "20191021_164638_090_syncRuleSrv.txt") {
			cout << "";
		}
		strncpy(g_test_http_param, filename.c_str(), TEST_HTTP_PARM_BUF_SIZE);
		if (string::npos != filename.find("loadScenario.txt")) {
			//long long scenarioId = read_id_from_json_load_scenario("./inbox/roster/" + filename);
			//snprintf(g_test_http_param, TEST_HTTP_PARM_BUF_SIZE, "%d", scenarioId);
			//handle_load_scenario(nc, hm);
		}
		else if (string::npos != filename.find("loadScenario.data.txt")
			|| string::npos != filename.find("export.data")) {
			//20180314 ain, /test2接口, 如果已经执行过 loadScenario则不再重新load, 耗时操作 loadScenario只做一次, 方便重复调试
			if ((!alwaysReloadData) && is_session_data_loaded(sessionName)) {
				Logger::getRuleLogger()->warn("/test_no_load_data SKIP loadScenario.data\n");
			}
			else {
				load_scenario_csv(sessionName, filename.c_str());
				load_debug_crews_json(sessionName, "DebugCrews");//OP#1966, 划定debug crew范围, 从DebugCrews读入
			}
		}
		else if (string::npos != filename.find("deleteRoster")
			|| string::npos != filename.find("assignRoster")
			|| string::npos != filename.find("addRoster")
			|| string::npos != filename.find("moveRoster")
			|| string::npos != filename.find("deleteRoster")
			|| string::npos != filename.find("undoAll")
			|| string::npos != filename.find("undoStep")
			|| string::npos != filename.find("swapRoster")
			|| string::npos != filename.find("makePairing")
			|| string::npos != filename.find("deletePairing")
			|| string::npos != filename.find("updatePairing")
			|| string::npos != filename.find("addSegToPairing")
			|| string::npos != filename.find("deleteSegFromPairing")
			|| string::npos != filename.find("addFerry")
			|| string::npos != filename.find("convertSegmentFlyAndDhd")
			|| string::npos != filename.find("batchSyncPairing")
			|| string::npos != filename.find("syncRuleSrv")
			|| string::npos != filename.find("updateRoster")
			|| string::npos != filename.find("splitPairing")
			|| string::npos != filename.find("splitPairingBySeg")
			|| string::npos != filename.find("rosterFlight")
			|| string::npos != filename.find("addFlight")
			|| string::npos != filename.find("updateTraining")
			) {
			handle_update_list(nc, hm);
		}
		else if (string::npos != filename.find("updateFlight")){
			handle_update_flight(nc, hm);
		}
		else if (string::npos != filename.find("tryPairingOnCrew")) {
			handle_try_pairing_on_crew(nc, hm);
		}
		else if (string::npos != filename.find("checkPairing")) {
			handle_check_pairing(nc, hm);
		}
		else if (string::npos != filename.find("updateActivityId")) {
			handle_update_list(nc, hm);
		}
		else if (string::npos != filename.find("checkCrew")) {
			handle_check_crew(nc, hm);
		}
		else if (string::npos != filename.find("updateCrew")){
			handle_update_crew(nc,hm);
		}
		else if (string::npos != filename.find("RouteActualRest")) {
			handle_route_actual_rest(nc, hm);//OP#1888
		}
		else if (string::npos != filename.find("CrewEntitlement")) {
			handle_crew_entitlement(nc, hm);//OP#1888
		}
		else if (string::npos != filename.find("CrewManday")) {
			handle_crew_manday(nc, hm);//OP#1888
		}
		else if (string::npos != filename.find("CrewPreference")) {
			handle_crew_preference(nc, hm);
		}
		else {
			Logger::getRuleLogger()->warn("TEST for {} NOT implemented", filename.c_str());
		}

		cout << "**DBG mem: " << (getProcessCurrentMem() / (1024 * 1024)) << " MB, peak mem: " << (getProcessPeakMem() / (1024 * 1024)) << endl;

	}
	Logger::getRuleLogger()->info("/test END");
	RuleStatistics::GetInstancePtr()->printLog("rule_statistics.txt");
	//g_ruleSrv_continue = false;
}

//************************************************************
//功能接口集中转发
//************************************************************-
static void ev_handler(struct mg_connection *nc, int ev, void *ev_data) {

	struct http_message *hm = (struct http_message *) ev_data;
	ErrorContext errCtx = { 0 };
	try {
		switch (ev) {
		case MG_EV_HTTP_REQUEST: {
			Logger::getRuleLogger()->info("request url:{}?{}", string(hm->uri.p, hm->uri.len), string(hm->query_string.p, hm->query_string.len));
			if (mg_vcmp(&hm->uri, CMD_LOAD_SCENARIO) == 0) {
				handle_load_scenario(nc, hm);
			}
			else if (mg_vcmp(&hm->uri, CMD_DESTROY_SESSION) == 0) {
				handle_session_destroy(nc, hm);
			}
			else if (mg_vcmp(&hm->uri, CMD_CHECK_RULE) == 0) {
				handle_check_pairing(nc, hm);
			}
			else if (mg_vcmp(&hm->uri, CMD_CHECK_CREW) == 0) {
				handle_check_crew(nc, hm);
			}
			else if (mg_vcmp(&hm->uri, CMD_UPDATE_FLIGHT) == 0) {
				handle_update_flight(nc, hm);
			}
			else if (mg_vcmp(&hm->uri, CMD_TRY_PAIRING) == 0) {
				handle_try_pairing_on_crew(nc, hm);
			}
			else if (mg_vcmp(&hm->uri, CMD_TEST_SCENARIO) == 0) {
				handle_test_scenario(nc, hm);
			}
			else if (mg_vcmp(&hm->uri, CMD_UPDATE_LIST) == 0) {
				handle_update_list(nc, hm);
			}
			else if (mg_vcmp(&hm->uri, CMD_GET_ROSTERS) == 0) {
				handle_get_rosters(nc, hm);
			}
			else if (mg_vcmp(&hm->uri, CMD_MGR_QUERY_CREW) == 0) {
				handle_query_crew(nc, hm);
			}
			else if (mg_vcmp(&hm->uri, CMD_TEST) == 0){
				handle_test(nc, hm);
			}
			else if (mg_vcmp(&hm->uri, CMD_TEST_NO_LOAD) == 0){
				handle_test(nc, hm, false);
			}
			else if (mg_vcmp(&hm->uri, CMD_UPDATE_CREW) == 0){
				handle_update_crew(nc, hm);
			}
			else if (mg_vcmp(&hm->uri, CMD_ROUTE_ACT_REST) == 0){
				handle_route_actual_rest(nc, hm);//OP#1888
			}
			else if (mg_vcmp(&hm->uri, CMD_CREW_ENTITLEMENT) == 0){
				handle_crew_entitlement(nc, hm);//OP#1888
			}
			else if (mg_vcmp(&hm->uri, CMD_CREW_PREFERENCE) == 0){
				handle_crew_preference(nc, hm);//OP#1888
			}
			else if (mg_vcmp(&hm->uri, CMD_CREW_MANDAY) == 0){
				handle_crew_manday(nc, hm);//OP#1888
			}
			else if (mg_vcmp(&hm->uri, CMD_UPDATE_BASEDATA) == 0) {
				handle_update_basedata(nc, hm);
			}
			else if (mg_vcmp(&hm->uri, CMD_UPDATE_SCENARIO) == 0) {
				handle_update_scenario(nc, hm);
			}
			else {
				mg_serve_http(nc, hm, s_http_server_opts);  /* Serve static content */
			}
			break;
		}
		default:
			break;
		}
	}
	catch (char * ex) {
		std::cout << "ERROR: exception " << ex << endl;
		errCtx.errorCode = -1;
		strncpy(errCtx.errorMsgBuf, ex, sizeof(errCtx.errorMsgBuf));
		HANDLE_RESULT(nc, hm, &errCtx);
	}
	catch (string& ex) {
		std::cout << "ERROR: exception " << ex << endl;
		errCtx.errorCode = -1;
		strncpy(errCtx.errorMsgBuf, ex.c_str(), sizeof(errCtx.errorMsgBuf));
		HANDLE_RESULT(nc, hm, &errCtx);
	}
	catch (std::exception& ex) {
		stringstream ss;
		ss << "exception " << ex.what();
		cout << "ERROR: " << ss.str() << endl;
		errCtx.errorCode = -1;
		strncpy(errCtx.errorMsgBuf, ss.str().c_str(), sizeof(errCtx.errorMsgBuf));
		HANDLE_RESULT(nc, hm, &errCtx);
	}
	catch (...) {
		std::cout << "ERROR: general exception " << endl;
		errCtx.errorCode = -1;
		strncpy(errCtx.errorMsgBuf, "unknown exception", sizeof(errCtx.errorMsgBuf));
		HANDLE_RESULT(nc, hm, &errCtx);
	}
}
//capture win32 exception
static int except_handler(unsigned int code, struct _EXCEPTION_POINTERS *ep) {
	cout << "Exception: win32 SEH exception, code=0x" << hex << code << endl;
	return 1;
}
static void ev_handler_wrap(struct mg_connection *nc, int ev, void *ev_data) {

	int ret = 0;
#ifdef WIN32
	__try {
		ev_handler(nc, ev, ev_data);
	}
	__except (except_handler(GetExceptionCode(), GetExceptionInformation())) {
		//cout << ("Exception occur!\n") << endl;
	}
#else
	ev_handler(nc, ev, ev_data);
#endif
}

int web_srv_start() {
	struct mg_mgr mgr = { 0 };
	struct mg_connection *nc = nullptr;

	mg_mgr_init(&mgr, nullptr);

	/* Set HTTP server options */
	nc = mg_bind(&mgr, g_port, ev_handler_wrap);
	if (nc == nullptr) {
		fprintf(stderr, "Error starting server on port %s\n", g_port);
		exit(-1);
	}

	mg_set_protocol_http_websocket(nc);
	s_http_server_opts.document_root = ".";
	s_http_server_opts.enable_directory_listing = "yes";


	Logger::getRuleLogger()->info("Starting RESTful server on port {}", g_port);
	//for (;;) {
	while (g_ruleSrv_continue) {
		mg_mgr_poll(&mgr, 1000);
	}
	mg_mgr_free(&mgr);

	return 0;
}

#else

void run() {
	AppComponent components; // Create scope Environment components

	/* create ApiControllers and add endpoints to router */
	auto router = components.httpRouter.getObject();

	router->addController(HttpController::createShared());

	/* create server */
	oatpp::network::Server server(components.serverConnectionProvider.getObject(),
		components.serverConnectionHandler.getObject());

	Logger::getRuleLogger()->info("Server Running on port {}...", components.serverConnectionProvider.getObject()->getProperty("port").toString()->c_str());
	Logger::getRuleConsoleLogger()->info("Server Running on port {}...", components.serverConnectionProvider.getObject()->getProperty("port").toString()->c_str());

	server.run();
}

int web_srv_start() {
	
	/* Init oatpp Environment */
	oatpp::base::Environment::init();

	run();

	/* Print how much objects were created during app running, and what have left-probably leaked */
	/* Disable object counting for release builds using '-D OATPP_DISABLE_ENV_OBJECT_COUNTERS' flag for better performance */
	std::cout << "\nEnvironment:\n";
	std::cout << "objectsCount = " << oatpp::base::Environment::getObjectsCount() << "\n";
	std::cout << "objectsCreated = " << oatpp::base::Environment::getObjectsCreated() << "\n\n";

	/* Destroy oatpp Environment */
	oatpp::base::Environment::destroy();

	return 0;
}
#endif