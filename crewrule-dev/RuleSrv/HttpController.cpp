#include "HttpController.h"

#ifndef MONGOOSE

#include "WebSrv.h"
#include "RuleEngineHandler.h"
#include "configParam.h"
#include "WebSrvSessionMgr.h"
#include <iostream>
#include <fstream>
#include <algorithm>
#include "SessionLock.h"
#include "OrLog.h"
#include "UtilFunc.h"
#include "JsonPairing.h"
#include "FileDirUtil.h"
#include "Log/Logger.h"

#include "rule/framework/utils/StringUtils.h"

#if defined(__unix) || defined(__APPLE__)
#define _snprintf snprintf
#endif

static bool g_ruleSrv_continue = true;
static WebSrvSessionMgr g_sessionMgr;

#define TEST_HTTP_PARM_BUF_SIZE 1024
static bool g_is_test = false;
static char g_test_http_param[TEST_HTTP_PARM_BUF_SIZE] = { 0 };

extern void printDebugRosterPairing(const string title, const CrewDataContext* dbData);

static bool is_session_data_loaded(const char * sessionName) {
	if (!g_sessionMgr.isSessionExist(sessionName)) {
		return false;
	}
	return !g_sessionMgr.getData(sessionName)->crewIdMap.empty();
}

/**
* 判断操作是否仅作用于当前请求，此时通过Session全局缓存数据复制临时缓存进行操作
*/
bool isRequestScope(const std::string requestSysName, const std::string type) {
	if (requestSysName == "server" && string::npos != type.find("check")) {
		return true;
	}

	return false;
}

/**
* 判断操作是否法规服务化模式
*/
bool isServiceMode(const std::string requestSysName) {
	if (requestSysName == "server") {
		return true;
	}
	return false;
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
		if (!g_sessionMgr.destroySession(sessionName)) {
			return false;
		}
		Logger::getRuleLogger()->warn("WARNING: session {} is already exist, destory it!", sessionName);
	}
	g_sessionMgr.addSession(sessionName);

	try {
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
		Logger::getRuleLogger()->error("load_scenario_csv exception: general exception");
	}
	return ret;
}

static void load_debug_crews_json(const char * sessionName, const char * filename) {
	//20181218 ain, OP#1966, 读取json文件 'DebugCrews.txt', 并按其中crewId内容删减 dbData->crewList

	if (!g_sessionMgr.isSessionExist(sessionName)) {
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

oatpp::String HttpController::getHttpParameter(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request, const oatpp::data::share::StringKeyLabel& name) const {
	oatpp::String result;

	if (name.getSize() == 0) {
		//获得POST请求体内容
		result = (request == nullptr) ? "" : request->readBodyToString();
		return result;
	}

	if (g_is_test) {
		result = (request == nullptr) ? queryParams.get(name) : request->getQueryParameter(name);
		if (result.get() != nullptr) {
			return result;
		}

		if (0 == strncmp("sessionName", name.std_str().c_str(), strlen("sessionName"))) {
			result = "test_session";
		}
		else if (0 == strncmp("file", name.std_str().c_str(), strlen("file"))) {
			result = g_test_http_param;
		}
		else if (0 == strncmp("json", name.std_str().c_str(), strlen("json"))) {
			result = "0";
		}
		else {
			result = "";
		}

	}
	else {
		result = (request == nullptr) ? queryParams.get(name) : request->getQueryParameter(name);
	}
	//request->getBodyStream()->read()
	return result == nullptr ? "" : result;
}

//************************************************************
//功能接口：加载场景数据
//************************************************************
std::shared_ptr<oatpp::web::protocol::http::outgoing::Response> HttpController::handle_load_scenario(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request) {

	std::shared_ptr<OutgoingResponse> response;
	ErrorContext errCtx = { 0 };
	char baseIdsBuf[100] = { 0 };
	char rankIdsBuf[100] = { 0 };
	char fleetIdsBuf[100] = { 0 };
	//char requestSysName[64] = { 0 };
	long long scenarioId = 0;
	char buf[256] = { 0 };
	time_t startDtLoc = 0;
	time_t endDtLoc = 0;
	int ret = 0;

	oatpp::String requestSysName = getHttpParameter(queryParams, request, "sys");

	//check session
	oatpp::String sessionName = getHttpParameter(queryParams, request, "sessionName");
	
	if (g_sessionMgr.isSessionExist(sessionName)) {
		//_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "handle_load_scenario failed, session '%s' already exist", sessionName);
		//Logger::getRuleLogger()->error("handle_load_scenario failed, session '" + (string)sessionName + "' not exist");
		if (!g_sessionMgr.destroySession(sessionName)) {
			return response;
		}
		Logger::getRuleLogger()->warn("WARNING:　session {} is already exist, destory it!", sessionName.get()->c_str());
	}
	g_sessionMgr.addSession(sessionName);

	bool _isServiceMode = isServiceMode(requestSysName);
	try {
		{
			SessionLock sessionLock(&g_sessionMgr, sessionName.get()->c_str());  //lock on constrution, unlock on obj at the end of scope
			oatpp::String scenarioStr = getHttpParameter(queryParams, request, "scenarioId");
			scenarioId = atoll(scenarioStr.getValue("0").c_str());

			oatpp::String jsonFile = getHttpParameter(queryParams, request, "file");

			/* 调用RuleEngine */
			auto dbData = g_sessionMgr.getData(sessionName);
			dbData->setIsServiceMode(_isServiceMode);
			if (scenarioStr.get()->length() > 0)
				ret = rule_engine_load(&errCtx, sessionName.get()->c_str(), dbData, g_sessionMgr.getRuleEngine(sessionName), scenarioId, jsonFile.get()->c_str());
			else
				ret = rule_engine_load_by_csv_file(&errCtx, sessionName.get()->c_str(), dbData, g_sessionMgr.getRuleEngine(sessionName), jsonFile.get()->c_str());
			//mantis#2085, free db connection
			//cleanupDBConnection(PairingDBContext::getDbConnection());			
		}

		/* 打印http response */
		response = HANDLE_RESULT(queryParams, request, &errCtx);
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
		Logger::getRuleLogger()->error("handle_load_scenario exception: general exception");
	}
	return response;
}

//************************************************************
//功能接口：检查Pairing法规
//************************************************************
std::shared_ptr<oatpp::web::protocol::http::outgoing::Response> HttpController::handle_check_pairing(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request) {

	ErrorContext errCtx = { 0 };
	int ret = 0;

	//check session
	oatpp::String sessionName = getHttpParameter(queryParams, request, "sessionName");
	if (sessionName.get() != nullptr && !g_sessionMgr.isSessionExist(sessionName)) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "change_pairing failed, session '%s' not exist", sessionName.get()->c_str());
		Logger::getRuleLogger()->error(errCtx.errorMsgBuf);
		return HANDLE_RESULT(queryParams, request, &errCtx);
	}

	oatpp::String jsonName = getHttpParameter(queryParams, request, "file");
	oatpp::String sessionStr = getHttpParameter(queryParams, request, "sessionName");
	oatpp::String requestSysName = getHttpParameter(queryParams, request, "sys");
	bool _isServiceMode = isServiceMode(requestSysName);

	try {
		SessionLock sessionLock(&g_sessionMgr, sessionName.get()->c_str());  //lock on constrution, unlock on obj at the end of scope

		/* 调用RuleEngine */
		auto dbData = g_sessionMgr.getData(sessionName);
		dbData->setIsServiceMode(_isServiceMode);
		ret = rule_engine_check(&errCtx, sessionName.get()->c_str(), dbData, g_sessionMgr.getRuleEngine(sessionName), jsonName.get()->c_str(), sessionStr.get()->c_str());
		if (ret != 0) {
			Logger::getRuleLogger()->error("rule_engine_check ret={}, errCtx.errorMsgBuf={}", ret, errCtx.errorMsgBuf);
		}
	}
	catch (char * ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex);
		Logger::getRuleLogger()->error("handle_check_pairing EXCEP: {}", ex);
	}
	catch (std::string& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.c_str());
		Logger::getRuleLogger()->error("handle_check_pairing EXCEP: {}", ex.c_str());
	}
	catch (std::exception& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.what());
		Logger::getRuleLogger()->error("handle_check_pairing EXCEP: {}", ex.what());
	}
	catch (...) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "general exception");
		Logger::getRuleLogger()->error("handle_check_pairing EXCEP: {}", "general exception");
	}
	return HANDLE_RESULT(queryParams, request, &errCtx);
}


std::shared_ptr<oatpp::web::protocol::http::outgoing::Response> HttpController::handle_check_crew(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request) {

	ErrorContext errCtx = { 0 };
	int ret = 0;

	//check session
	oatpp::String sessionName = getHttpParameter(queryParams, request, "sessionName");
	if (sessionName.get() != nullptr && !g_sessionMgr.isSessionExist(sessionName)) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "check_crew failed, session '%s' not exist", sessionName.get()->c_str());
		Logger::getRuleLogger()->error(errCtx.errorMsgBuf);
		return HANDLE_RESULT(queryParams, request, &errCtx);
	}

	oatpp::String jsonName = getHttpParameter(queryParams, request, "file");
	oatpp::String requestSysName = getHttpParameter(queryParams, request, "sys");
	oatpp::String type = getHttpParameter(queryParams, request, "type");
	oatpp::String ruleSetId = getHttpParameter(queryParams, request, "ruleSetId");

	bool _isServiceMode = isServiceMode(requestSysName);
	bool _isRequestScope = isRequestScope(requestSysName, type);

	try {
		SessionLock sessionLock(&g_sessionMgr, sessionName.get()->c_str());  //lock on constrution, unlock on obj at the end of scope

		/* 调用RuleEngine */
		auto dbData = g_sessionMgr.getData(sessionName);
		auto ruleEngine = g_sessionMgr.getRuleEngine(sessionName);
		dbData->setIsServiceMode(_isServiceMode);
		if (_isRequestScope) {
			//创建临时缓存时，重新创建ruleEngine对象，并且重置dbData
			long long _ruleSetId = atoll(ruleSetId.getValue("-1").c_str());
			ruleEngine->setDataContext(dbData, _ruleSetId, false);
		}
		ret = rule_engine_check_crew(&errCtx, sessionName.get()->c_str(), dbData, ruleEngine, jsonName.get()->c_str());
		if (ret != 0) {
			Logger::getRuleLogger()->error("handle_check_crew ret={}, errCtx.errorMsgBuf={}", ret, errCtx.errorMsgBuf);
		}

	}
	catch (char * ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex);
		Logger::getRuleLogger()->error("handle_check_crew EXCEP: {}", ex);
	}
	catch (std::string& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.c_str());
		Logger::getRuleLogger()->error("handle_check_crew EXCEP: {}", ex.c_str());
	}
	catch (std::exception& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.what());
		Logger::getRuleLogger()->error("handle_check_crew EXCEP: {}", ex.what());
	}
	catch (...) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "general exception");
		Logger::getRuleLogger()->error("handle_check_crew EXCEP: {}", "general exception");
	}
	return HANDLE_RESULT(queryParams, request, &errCtx);
}


std::shared_ptr<oatpp::web::protocol::http::outgoing::Response> HttpController::handle_update_flight(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request) {

	ErrorContext errCtx = { 0 };
	int jsonSize = 0;
	oatpp::String jsonBuf;
	int ret = 0;
	
	//check session
	oatpp::String sessionName = getHttpParameter(queryParams, request, "sessionName");
	if (sessionName.get() != nullptr && !g_sessionMgr.isSessionExist(sessionName)) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "handle_update_flight failed, session '%s' not exist", sessionName.get()->c_str());
		Logger::getRuleLogger()->error(errCtx.errorMsgBuf);
		return HANDLE_RESULT(queryParams, request, &errCtx);
	}

	oatpp::String requestSysName = getHttpParameter(queryParams, request, "sys");
	bool _isServiceMode = isServiceMode(requestSysName);
	try {
		SessionLock sessionLock(&g_sessionMgr, sessionName.get()->c_str());  //lock on constrution, unlock on obj at the end of scope

		oatpp::String fileName;
		//若参数为 json，则直接获取json内容
		//若参数为 file，则从文件读取json内容
		oatpp::String strJsonSize = getHttpParameter(queryParams, request, "json");
		int jsonSize = strJsonSize.get()->empty() ? 0 : std::stoi(strJsonSize);
		if (jsonSize > 0) {
			jsonBuf = getHttpParameter(queryParams, request, "");

			if (jsonBuf == nullptr) {
				errCtx.errorCode = -1;
				_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "get json from http fail");
				return HANDLE_RESULT(queryParams, request, &errCtx);
			}
		}
		else {
			fileName = getHttpParameter(queryParams, request, "file");
		}
		auto dbData = g_sessionMgr.getData(sessionName);
		dbData->setIsServiceMode(_isServiceMode);
		ret = rule_engine_update_filght(&errCtx, sessionName.get()->c_str(), dbData, g_sessionMgr.getRuleEngine(sessionName), (jsonBuf == nullptr ? nullptr : jsonBuf.get()->c_str()), fileName.get()->c_str());
		if (ret != 0) {
			Logger::getRuleLogger()->error("handle_update_flight ret={}, errCtx.errorMsgBuf={}", ret, errCtx.errorMsgBuf);
		}
	}
	catch (char * ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex);
		Logger::getRuleLogger()->error("handle_update_flight EXCEP: {}", ex);
	}
	catch (std::string& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.c_str());
		Logger::getRuleLogger()->error("handle_update_flight EXCEP: {}", ex.c_str());
	}
	catch (std::exception& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.what());
		Logger::getRuleLogger()->error("handle_update_flight EXCEP: {}", ex.what());
	}
	catch (...) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "general exception");
		Logger::getRuleLogger()->error("handle_update_flight EXCEP: {}", "general exception");
	}
	return HANDLE_RESULT(queryParams, request, &errCtx);
}

std::shared_ptr<oatpp::web::protocol::http::outgoing::Response> HttpController::handle_try_pairing_on_crew(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request) {

	ErrorContext errCtx = { 0 };
	int ret = 0;

	//check session
	oatpp::String sessionName = getHttpParameter(queryParams, request, "sessionName");
	if (sessionName.get() != nullptr && !g_sessionMgr.isSessionExist(sessionName)) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "try_pairing_on_crew failed, session '%s' not exist", sessionName.get()->c_str());
		Logger::getRuleLogger()->error(errCtx.errorMsgBuf);
		return HANDLE_RESULT(queryParams, request, &errCtx);
	}

	oatpp::String jsonName = getHttpParameter(queryParams, request, "file");
	oatpp::String requestSysName = getHttpParameter(queryParams, request, "sys");
	bool _isServiceMode = isServiceMode(requestSysName);
	try {
		SessionLock sessionLock(&g_sessionMgr, sessionName.get()->c_str());  //lock on constrution, unlock on obj at the end of scope

		/* 调用RuleEngine */
		auto dbData = g_sessionMgr.getData(sessionName);
		dbData->setIsServiceMode(_isServiceMode);
		ret = rule_engine_try_pairing_on_crew(&errCtx, sessionName.get()->c_str(), dbData, g_sessionMgr.getRuleEngine(sessionName), jsonName.get()->c_str());
		if (ret != 0) {
			Logger::getRuleLogger()->error("handle_try_pairing_on_crew ret={}, errCtx.errorMsgBuf={}", ret, errCtx.errorMsgBuf);
		}
	}
	catch (char * ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex);
		Logger::getRuleLogger()->error("handle_try_pairing_on_crew EXCEP: {}", ex);
	}
	catch (std::string& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.c_str());
		Logger::getRuleLogger()->error("handle_try_pairing_on_crew EXCEP: {}", ex.c_str());
	}
	catch (std::exception& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.what());
		Logger::getRuleLogger()->error("handle_try_pairing_on_crew EXCEP: {}", ex.what());
	}
	catch (...) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "general exception");
		Logger::getRuleLogger()->error("handle_try_pairing_on_crew EXCEP: {}", "general exception");
	}
	return HANDLE_RESULT(queryParams, request, &errCtx);
}

std::shared_ptr<oatpp::web::protocol::http::outgoing::Response> HttpController::handle_session_destroy(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request) {

	ErrorContext errCtx = { 0 };
	int ret = 0;

	oatpp::String requestSysName = getHttpParameter(queryParams, request, "sys");

	//check session
	oatpp::String sessionName = getHttpParameter(queryParams, request, "sessionName");
	if (sessionName.get() != nullptr && !g_sessionMgr.isSessionExist(sessionName)) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "handle_session_destroy failed, session '%s' not exist", sessionName.get()->c_str());
		Logger::getRuleLogger()->error(errCtx.errorMsgBuf);
		return HANDLE_RESULT(queryParams, request, &errCtx);

	}
	g_sessionMgr.destroySession(sessionName);

	//若清空session，则关闭ruleSrv
	if (g_sessionMgr.size() == 0) {
		Logger::getRuleLogger()->error("handle_session_destroy no session exist, ruleSrv END");
		g_ruleSrv_continue = false;
	}

	return HANDLE_RESULT(queryParams, request, &errCtx);
}

std::shared_ptr<oatpp::web::protocol::http::outgoing::Response> HttpController::handle_test_scenario(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request) {

	int ret = 0;
	string sessionName = "test";

	g_sessionMgr.addSession(sessionName);


	/* 调用RuleEngine */
	ret = rule_engine_test(g_sessionMgr.getData(sessionName), g_sessionMgr.getRuleEngine(sessionName));

	/* 打印http response */
	return HANDLE_RESULT(queryParams, request, 0);

}

//**************************************
//handle_update_list
//支持硬盘文件传递json、也支持http post方式传递json
//**************************************
std::shared_ptr<oatpp::web::protocol::http::outgoing::Response> HttpController::handle_update_list(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request) {

	Logger::getRuleLogger()->debug("[HttpController] handle_update_list start============");
	long long lapsed = clock();

	ErrorContext errCtx = { 0 };
	oatpp::String fileName{};
	oatpp::String jsonBuf{};
	int ret = 0;
	string op = "";

	//check session
	oatpp::String sessionName = getHttpParameter(queryParams, request, "sessionName");
	if (sessionName.get() != nullptr && !g_sessionMgr.isSessionExist(sessionName)) {
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "handle_update_list failed, session '%s' not exist", sessionName.get()->c_str());
		Logger::getRuleLogger()->error(errCtx.errorMsgBuf);
		return HANDLE_RESULT(queryParams, request, &errCtx);
	}

	oatpp::String requestSysName = getHttpParameter(queryParams, request, "sys");
	oatpp::String type = getHttpParameter(queryParams, request, "type");
	oatpp::String requestTransactionId = getHttpParameter(queryParams, request, "transactionId");
	oatpp::String ruleSetId = getHttpParameter(queryParams, request, "ruleSetId");
	oatpp::String requestTransactionStatus = getHttpParameter(queryParams, request, "status");

	//若参数为 json，则直接获取json内容
	//若参数为 file，则从文件读取json内容
	oatpp::String strJsonSize = getHttpParameter(queryParams, request, "json");
	int jsonSize = strJsonSize.get()->empty() ? 0 : std::stoi(strJsonSize);
	if (jsonSize > 0) {
		jsonBuf = getHttpParameter(queryParams, request, "");
		if (jsonBuf.get() == nullptr) {
			errCtx.errorCode = -1;
			_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "get json from http fail ");
			return HANDLE_RESULT(queryParams, request, &errCtx);
		}
	}
	else {
		fileName = getHttpParameter(queryParams, request, "file");
	}

	bool _isRequestScope = isRequestScope(requestSysName, type);
	bool _isServiceMode = isServiceMode(requestSysName);
	shared_ptr<CrewDataContext> dbData = nullptr;
	shared_ptr<LegalityChecker> ruleEngine = nullptr;
	try {
		SessionLock sessionLock(&g_sessionMgr, sessionName.get()->c_str(), true, _isRequestScope, requestTransactionId.get()->c_str());  //lock on constrution, unlock on obj at the end of scope
		dbData = g_sessionMgr.getData(sessionName, _isRequestScope, requestTransactionId.get()->c_str());
		dbData->reset();
		dbData->setRequestTransactionId(requestTransactionId.get()->c_str());
		dbData->setRequestTransactionStatus(requestTransactionStatus.get()->c_str());
		dbData->setIsRequestScope(_isRequestScope);
		dbData->setIsServiceMode(_isServiceMode);
		ruleEngine = g_sessionMgr.getRuleEngine(sessionName, _isRequestScope, requestTransactionId.get()->c_str());
		if (_isRequestScope) {
			//创建临时缓存时，重新创建ruleEngine对象，并且重置dbData
			long long _ruleSetId = atoll(ruleSetId.getValue("-1").c_str());
			if (_ruleSetId == -1) {
				Logger::getRuleLogger()->error("[handle_update_list] request ruleSet missing. ruleSetId:{}", _ruleSetId);
			}
			ruleEngine->setDataContext(dbData, _ruleSetId, false);
		}

	}
	catch (...) {
		//cout << "Exception: session[" << sessionName << "]" << endl;
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "general exception");
		return HANDLE_RESULT(queryParams, request, &errCtx);
	}


	try {
		SessionLock sessionLock(&g_sessionMgr, sessionName.get()->c_str(), !_isRequestScope, _isRequestScope, requestTransactionId.get()->c_str());  //lock on constrution, unlock on obj at the end of scope

		ret = rule_engine_update_list(&errCtx, sessionName.get()->c_str(), dbData, ruleEngine, (jsonBuf == nullptr ? nullptr : jsonBuf.get()->c_str()), fileName.get()->c_str());

		if (ret != 0) {
			Logger::getRuleLogger()->error("handle_update_list ret={}, errCtx.errorMsgBuf={}", ret, errCtx.errorMsgBuf);
		}
	}
	catch (char * ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex);
		Logger::getRuleLogger()->error("handle_update_list EXCEP: {}", ex);
	}
	catch (std::string& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.c_str());
		Logger::getRuleLogger()->error("handle_update_list EXCEP: {}", ex.c_str());
	}
	catch (std::exception& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.what());
		Logger::getRuleLogger()->error("handle_update_list EXCEP: {}", ex.what());
	}
	catch (...) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "general exception");
		Logger::getRuleLogger()->error("handle_update_list EXCEP: {}", "general exception");
	}
	//必须在sessionLock析构后执行
	if (strToUpper(requestTransactionStatus.get()->c_str()) == "CLOSE") {
		g_sessionMgr.endTransaction(requestTransactionId.get()->c_str());
	}	
	
	Logger::getRuleLogger()->debug("[HttpController] handle_update_list end, cost {} ms. ==============", ((clock() - lapsed) * 1000) / CLOCKS_PER_SEC);
	return HANDLE_RESULT(queryParams, request, &errCtx);
}

std::shared_ptr<oatpp::web::protocol::http::outgoing::Response> HttpController::handle_get_rosters(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request) {
	ErrorContext errCtx = { 0 };
	int ret = 0;

	//check session
	oatpp::String sessionName = getHttpParameter(queryParams, request, "sessionName");
	if (sessionName.get() != nullptr && !g_sessionMgr.isSessionExist(sessionName)) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "handle_get_rosters failed, session '%s' not exist", sessionName.get()->c_str());
		Logger::getRuleLogger()->error(errCtx.errorMsgBuf);
		return HANDLE_RESULT(queryParams, request, &errCtx);
	}

	oatpp::String requestSysName = getHttpParameter(queryParams, request, "sys");
	bool _isServiceMode = isServiceMode(requestSysName);

	/* 调用RuleEngine */
	stringstream outputStream;
	oatpp::String idcrew = getHttpParameter(queryParams, request, "idcrew");
	auto dbData = g_sessionMgr.getData(sessionName);
	dbData->setIsServiceMode(_isServiceMode);
	ret = rule_engine_get_rosters(&errCtx, sessionName.get()->c_str(), dbData, g_sessionMgr.getRuleEngine(sessionName), idcrew.get()->c_str(), outputStream);
	cout << outputStream.str() << endl;

	return HANDLE_RESULT(queryParams, request, &errCtx, outputStream);
}

std::shared_ptr<oatpp::web::protocol::http::outgoing::Response> HttpController::handle_query_crew(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request) {
	ErrorContext errCtx = { 0 };
	int ret = 0;
	g_is_test = true;
	//check session
	oatpp::String sessionName = getHttpParameter(queryParams, request, "sessionName");
	if (sessionName.get() != nullptr && !g_sessionMgr.isSessionExist(sessionName)) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "handle_get_rosters failed, session '%s' not exist", sessionName.get()->c_str());
		Logger::getRuleLogger()->error(errCtx. errorMsgBuf);
		return HANDLE_RESULT(queryParams, request, &errCtx);
	}

	oatpp::String requestSysName = getHttpParameter(queryParams, request, "sys");
	bool _isServiceMode = isServiceMode(requestSysName);

	/* 调用RuleEngine */
	stringstream outputStream;
	oatpp::String idcrew = getHttpParameter(queryParams, request, "idcrew");
	auto dbData = g_sessionMgr.getData(sessionName);
	dbData->setIsServiceMode(_isServiceMode);
	ret = rule_engine_query_crew(&errCtx, sessionName.get()->c_str(), dbData, idcrew.get()->c_str(), outputStream);
	cout << outputStream.str() << endl;
	/* 打印http response */
	return HANDLE_RESULT(queryParams, request, &errCtx, outputStream);
}

std::shared_ptr<oatpp::web::protocol::http::outgoing::Response> HttpController::handle_update_crew(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request) {
	ErrorContext errCtx = { 0 };
	int ret = 0;

	//check session
	oatpp::String sessionName = getHttpParameter(queryParams, request, "sessionName");
	if (!g_sessionMgr.isSessionExist(sessionName)) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "update_crew failed, session '%s' not exist", sessionName.get()->c_str());
		Logger::getRuleLogger()->error(errCtx.errorMsgBuf);
		return HANDLE_RESULT(queryParams, request, &errCtx);
	}
	oatpp::String csvName = getHttpParameter(queryParams, request, "file");
	oatpp::String requestSysName = getHttpParameter(queryParams, request, "sys");
	bool _isServiceMode = isServiceMode(requestSysName);

	try {
		SessionLock sessionLock(&g_sessionMgr, sessionName.get()->c_str());  //lock on constrution, unlock on obj at the end of scope

		/* 调用RuleEngine */
		auto dbData = g_sessionMgr.getData(sessionName);
		dbData->setIsServiceMode(_isServiceMode);
		ret = rule_engine_update_crew(&errCtx, sessionName.get()->c_str(), dbData, g_sessionMgr.getRuleEngine(sessionName), csvName.get()->c_str());
		if (ret != 0) {
			Logger::getRuleLogger()->error("handle_update_crew ret={}, errCtx.errorMsgBuf={}", ret, errCtx.errorMsgBuf);
		}
	}
	catch (char * ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex);
		Logger::getRuleLogger()->error("handle_update_crew EXCEP: {}", ex);
	}
	catch (std::string& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.c_str());
		Logger::getRuleLogger()->error("handle_update_crew EXCEP: {}", ex.c_str());
	}
	catch (std::exception& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.what());
		Logger::getRuleLogger()->error("handle_update_crew EXCEP: {}", ex.what());
	}
	catch (...) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "general exception");
		Logger::getRuleLogger()->error("handle_update_crew EXCEP: {}", "general exception");
	}
	return HANDLE_RESULT(queryParams, request, &errCtx);
}

std::shared_ptr<oatpp::web::protocol::http::outgoing::Response> HttpController::handle_route_actual_rest(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request) {
	ErrorContext errCtx = { 0 };
	oatpp::String fileName = {};
	oatpp::String jsonBuf{};
	int ret = 0;

	//check session
	oatpp::String sessionName = getHttpParameter(queryParams, request, "sessionName");
	if (sessionName.get() != nullptr && !g_sessionMgr.isSessionExist(sessionName)) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "route_actual_rest failed, session '%s' not exist", sessionName.get()->c_str());
		Logger::getRuleLogger()->error(errCtx.errorMsgBuf);
		return HANDLE_RESULT(queryParams, request, &errCtx);
	}

	//若参数为 json，则直接获取json内容
	//若参数为 file，则从文件读取json内容
	oatpp::String strJsonSize = getHttpParameter(queryParams, request, "json");
	int jsonSize = strJsonSize.get()->empty() ? 0 : std::stoi(strJsonSize);
	if (jsonSize > 0) {
		jsonBuf = getHttpParameter(queryParams, request, "");

		if (jsonBuf == nullptr) {
			errCtx.errorCode = -1;
			_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "get json from http fail");
			return HANDLE_RESULT(queryParams, request, &errCtx);
		}
	}
	else {
		fileName = getHttpParameter(queryParams, request, "file");
	}
	oatpp::String requestSysName = getHttpParameter(queryParams, request, "sys");
	bool _isServiceMode = isServiceMode(requestSysName);

	try {
		SessionLock sessionLock(&g_sessionMgr, sessionName.get()->c_str());  //lock on constrution, unlock on obj at the end of scope

		/* 调用RuleEngine */
		auto dbData = g_sessionMgr.getData(sessionName);
		dbData->setIsServiceMode(_isServiceMode);
		ret = rule_engine_route_actual_rest(&errCtx, sessionName.get()->c_str(), dbData, g_sessionMgr.getRuleEngine(sessionName), (jsonBuf == nullptr ? nullptr : jsonBuf.get()->c_str()), fileName.get()->c_str());
		if (ret != 0) {
			Logger::getRuleLogger()->error("handle_route_actual_rest ret={}, errCtx.errorMsgBuf={}", ret, errCtx.errorMsgBuf);
		}
	}
	catch (char * ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex);
		Logger::getRuleLogger()->error("handle_route_actual_rest EXCEP: {}", ex);
	}
	catch (std::string& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.c_str());
		Logger::getRuleLogger()->error("handle_route_actual_rest EXCEP: {}", ex.c_str());
	}
	catch (std::exception& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.what());
		Logger::getRuleLogger()->error("handle_route_actual_rest EXCEP: {}", ex.what());
	}
	catch (...) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "general exception");
		Logger::getRuleLogger()->error("handle_route_actual_rest EXCEP: {}", "general exception");
	}
	return HANDLE_RESULT(queryParams, request, &errCtx);
}


std::shared_ptr<oatpp::web::protocol::http::outgoing::Response> HttpController::handle_crew_preference(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request) {
	ErrorContext errCtx = { 0 };
	oatpp::String fileName{};
	oatpp::String jsonBuf{};
	int ret = 0;

	//check session
	oatpp::String sessionName = getHttpParameter(queryParams, request, "sessionName");
	if (sessionName.get() != nullptr && !g_sessionMgr.isSessionExist(sessionName)) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "crew_preference failed, session '%s' not exist", sessionName.get()->c_str());
		Logger::getRuleLogger()->error(errCtx.errorMsgBuf);
		return HANDLE_RESULT(queryParams, request, &errCtx);
	}

	//若参数为 json，则直接获取json内容
	//若参数为 file，则从文件读取json内容
	oatpp::String strJsonSize = getHttpParameter(queryParams, request, "json");
	int jsonSize = strJsonSize.get()->empty() ? 0 : std::stoi(strJsonSize);
	if (jsonSize > 0) {
		jsonBuf = getHttpParameter(queryParams, request, "");

		if (jsonBuf == nullptr) {
			errCtx.errorCode = -1;
			_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "get json from http fail");
			return HANDLE_RESULT(queryParams, request, &errCtx);
		}
	}
	else {
		fileName = getHttpParameter(queryParams, request, "file");
	}
	oatpp::String requestSysName = getHttpParameter(queryParams, request, "sys");
	bool _isServiceMode = isServiceMode(requestSysName);
	try {
		SessionLock sessionLock(&g_sessionMgr, sessionName.get()->c_str());  //lock on constrution, unlock on obj at the end of scope

		/* 调用RuleEngine */
		auto dbData = g_sessionMgr.getData(sessionName);
		dbData->setIsServiceMode(_isServiceMode);
		ret = rule_engine_crew_preference(&errCtx, sessionName.get()->c_str(), dbData, g_sessionMgr.getRuleEngine(sessionName), (jsonBuf == nullptr ? nullptr : jsonBuf.get()->c_str()), fileName.get()->c_str());
		if (ret != 0) {
			Logger::getRuleLogger()->error("handle_crew_preference ret={}, errCtx.errorMsgBuf={}", ret, errCtx.errorMsgBuf);
		}
	}
	catch (char * ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex);
		Logger::getRuleLogger()->error("handle_crew_preference EXCEP: {}", ex);
	}
	catch (std::string& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.c_str());
		Logger::getRuleLogger()->error("handle_crew_preference EXCEP: {}", ex.c_str());
	}
	catch (std::exception& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.what());
		Logger::getRuleLogger()->error("handle_crew_preference EXCEP: {}", ex.what());
	}
	catch (...) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "general exception");
		Logger::getRuleLogger()->error("handle_crew_preference EXCEP: {}", "general exception");
	}
	return HANDLE_RESULT(queryParams, request, &errCtx);
}

std::shared_ptr<oatpp::web::protocol::http::outgoing::Response> HttpController::handle_crew_entitlement(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request) {
	ErrorContext errCtx = { 0 };
	oatpp::String fileName{};
	oatpp::String jsonBuf{};
	int ret = 0;

	//check session
	oatpp::String sessionName = getHttpParameter(queryParams, request, "sessionName");
	if (sessionName.get() != nullptr && !g_sessionMgr.isSessionExist(sessionName)) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "crew_entitlement failed, session '%s' not exist", sessionName.get()->c_str());
		Logger::getRuleLogger()->error(errCtx.errorMsgBuf);
		return HANDLE_RESULT(queryParams, request, &errCtx);
	}

	//若参数为 json，则直接获取json内容
	//若参数为 file，则从文件读取json内容
	oatpp::String strJsonSize = getHttpParameter(queryParams, request, "json");
	int jsonSize = strJsonSize.get()->empty() ? 0 : std::stoi(strJsonSize);
	if (jsonSize > 0) {
		jsonBuf = getHttpParameter(queryParams, request, "");

		if (jsonBuf == nullptr) {
			errCtx.errorCode = -1;
			_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "get json from http fail");
			return HANDLE_RESULT(queryParams, request, &errCtx);
		}
	}
	else {
		fileName = getHttpParameter(queryParams, request, "file");
	}

	oatpp::String requestSysName = getHttpParameter(queryParams, request, "sys");
	bool _isServiceMode = isServiceMode(requestSysName);

	try {
		SessionLock sessionLock(&g_sessionMgr, sessionName.get()->c_str());  //lock on constrution, unlock on obj at the end of scope

		/* 调用RuleEngine */
		auto dbData = g_sessionMgr.getData(sessionName);
		dbData->setIsServiceMode(_isServiceMode);
		ret = rule_engine_crew_entitlement(&errCtx, sessionName.get()->c_str(), dbData, g_sessionMgr.getRuleEngine(sessionName), (jsonBuf == nullptr ? nullptr : jsonBuf.get()->c_str()), fileName.get()->c_str());
		if (ret != 0) {
			Logger::getRuleLogger()->error("handle_crew_entitlement ret={}, errCtx.errorMsgBuf={}", ret, errCtx.errorMsgBuf);
		}
	}
	catch (char * ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex);
		Logger::getRuleLogger()->error("handle_crew_entitlement EXCEP: {}", ex);
	}
	catch (std::string& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.c_str());
		Logger::getRuleLogger()->error("handle_crew_entitlement EXCEP: {}", ex.c_str());
	}
	catch (std::exception& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.what());
		Logger::getRuleLogger()->error("handle_crew_entitlement EXCEP: {}", ex.what());
	}
	catch (...) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "general exception");
		Logger::getRuleLogger()->error("handle_crew_entitlement EXCEP: {}", "general exception");
	}
	return HANDLE_RESULT(queryParams, request, &errCtx);
}

std::shared_ptr<oatpp::web::protocol::http::outgoing::Response> HttpController::handle_crew_manday(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request) {
	ErrorContext errCtx = { 0 };
	oatpp::String fileName{};
	oatpp::String jsonBuf{};
	int ret = 0;

	//check session
	oatpp::String sessionName = getHttpParameter(queryParams, request, "sessionName");
	if (sessionName.get() != nullptr && !g_sessionMgr.isSessionExist(sessionName)) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "crew_manday failed, session '%s' not exist", sessionName.get()->c_str());
		Logger::getRuleLogger()->error(errCtx.errorMsgBuf);
		return HANDLE_RESULT(queryParams, request, &errCtx);
	}

	//若参数为 json，则直接获取json内容
	//若参数为 file，则从文件读取json内容
	oatpp::String strJsonSize = getHttpParameter(queryParams, request, "json");
	int jsonSize = strJsonSize.get()->empty() ? 0 : std::stoi(strJsonSize);
	if (jsonSize > 0) {
		jsonBuf = getHttpParameter(queryParams, request, "");

		if (jsonBuf == nullptr) {
			errCtx.errorCode = -1;
			_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "get json from http fail");
			return HANDLE_RESULT(queryParams, request, &errCtx);
		}
	}
	else {
		fileName = getHttpParameter(queryParams, request, "file");
	}

	oatpp::String requestSysName = getHttpParameter(queryParams, request, "sys");
	bool _isServiceMode = isServiceMode(requestSysName);

	try {
		SessionLock sessionLock(&g_sessionMgr, sessionName.get()->c_str());  //lock on constrution, unlock on obj at the end of scope

		/* 调用RuleEngine */
		auto dbData = g_sessionMgr.getData(sessionName);
		dbData->setIsServiceMode(_isServiceMode);
		ret = rule_engine_crew_manday(&errCtx, sessionName.get()->c_str(), dbData, g_sessionMgr.getRuleEngine(sessionName), (jsonBuf == nullptr ? nullptr : jsonBuf.get()->c_str()), fileName.get()->c_str());
		if (ret != 0) {
			Logger::getRuleLogger()->error("handle_crew_manday ret={}, errCtx.errorMsgBuf={}", ret, errCtx.errorMsgBuf);
		}
	}
	catch (char * ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex);
		Logger::getRuleLogger()->error("handle_crew_manday EXCEP: {}", ex);
	}
	catch (std::string& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.c_str());
		Logger::getRuleLogger()->error("handle_crew_manday EXCEP: {}", ex.c_str());
	}
	catch (std::exception& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.what());
		Logger::getRuleLogger()->error("handle_crew_manday EXCEP: {}", ex.what());
	}
	catch (...) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "general exception");
		Logger::getRuleLogger()->error("handle_crew_manday EXCEP: {}", "general exception");
	}
	return HANDLE_RESULT(queryParams, request, &errCtx);
}

std::shared_ptr<oatpp::web::protocol::http::outgoing::Response> HttpController::handle_get_worry_data(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request) {
	ErrorContext errCtx = { 0 };
	int ret = 0;

	//check session
	oatpp::String sessionName = getHttpParameter(queryParams, request, "sessionName");
	if (sessionName.get() != nullptr && !g_sessionMgr.isSessionExist(sessionName)) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "rule_engine_check_duty_code failed, session '%s' not exist", sessionName.get()->c_str());
		Logger::getRuleLogger()->error(errCtx.errorMsgBuf);
		return HANDLE_RESULT(queryParams, request, &errCtx);
	}

	oatpp::String jsonName = getHttpParameter(queryParams, request, "file");
	oatpp::String sessionStr = getHttpParameter(queryParams, request, "sessionName");
	oatpp::String requestSysName = getHttpParameter(queryParams, request, "sys");
	bool _isServiceMode = isServiceMode(requestSysName);

	try {
		SessionLock sessionLock(&g_sessionMgr, sessionName.get()->c_str());  //lock on constrution, unlock on obj at the end of scope

		/* 调用RuleEngine */
		auto dbData = g_sessionMgr.getData(sessionName);
		dbData->setIsServiceMode(_isServiceMode);
		ret = rule_engine_get_worry_crew(&errCtx, sessionName.get()->c_str(), dbData, g_sessionMgr.getRuleEngine(sessionName), jsonName.get()->c_str(), sessionStr.get()->c_str());
		if (ret != 0) {
			Logger::getRuleLogger()->error("rule_engine_check_duty_code ret={}, errCtx.errorMsgBuf={}", ret, errCtx.errorMsgBuf);
		}
	}
	catch (char* ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex);
		Logger::getRuleLogger()->error("check_duty_code EXCEP: {}", ex);
	}
	catch (std::string& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.c_str());
		Logger::getRuleLogger()->error("check_duty_code EXCEP: {}", ex.c_str());
	}
	catch (std::exception& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.what());
		Logger::getRuleLogger()->error("check_duty_code EXCEP: {}", ex.what());
	}
	catch (...) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "general exception");
		Logger::getRuleLogger()->error("check_duty_code EXCEP: {}", "general exception");
	}
	return HANDLE_RESULT(queryParams, request, &errCtx);
}

std::shared_ptr<oatpp::web::protocol::http::outgoing::Response> HttpController::handle_check_duty_code(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request) {
	ErrorContext errCtx = { 0 };
	int ret = 0;

	//check session
	oatpp::String sessionName = getHttpParameter(queryParams, request, "sessionName");
	if (sessionName.get() != nullptr && !g_sessionMgr.isSessionExist(sessionName)) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "rule_engine_check_duty_code failed, session '%s' not exist", sessionName.get()->c_str());
		Logger::getRuleLogger()->error(errCtx.errorMsgBuf);
		return HANDLE_RESULT(queryParams, request, &errCtx);
	}

	oatpp::String jsonName = getHttpParameter(queryParams, request, "file");
	oatpp::String sessionStr = getHttpParameter(queryParams, request, "sessionName");
	oatpp::String requestSysName = getHttpParameter(queryParams, request, "sys");
	bool _isServiceMode = isServiceMode(requestSysName);

	try {
		SessionLock sessionLock(&g_sessionMgr, sessionName.get()->c_str());  //lock on constrution, unlock on obj at the end of scope

		/* 调用RuleEngine */
		auto dbData = g_sessionMgr.getData(sessionName);
		dbData->setIsServiceMode(_isServiceMode);
		ret = rule_engine_check_duty_code(&errCtx, sessionName.get()->c_str(), dbData, g_sessionMgr.getRuleEngine(sessionName), jsonName.get()->c_str(), sessionStr.get()->c_str());
		if (ret != 0) {
			Logger::getRuleLogger()->error("rule_engine_check_duty_code ret={}, errCtx.errorMsgBuf={}", ret, errCtx.errorMsgBuf);
		}
	}
	catch (char* ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex);
		Logger::getRuleLogger()->error("check_duty_code EXCEP: {}", ex);
	}
	catch (std::string& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.c_str());
		Logger::getRuleLogger()->error("check_duty_code EXCEP: {}", ex.c_str());
	}
	catch (std::exception& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.what());
		Logger::getRuleLogger()->error("check_duty_code EXCEP: {}", ex.what());
	}
	catch (...) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "general exception");
		Logger::getRuleLogger()->error("check_duty_code EXCEP: {}", "general exception");
	}
	return HANDLE_RESULT(queryParams, request, &errCtx);
}


std::shared_ptr<oatpp::web::protocol::http::outgoing::Response> HttpController::handle_get_duty_code(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request) {
	ErrorContext errCtx = { 0 };
	int ret = 0;

	//check session
	oatpp::String sessionName = getHttpParameter(queryParams, request, "sessionName");
	if (sessionName.get() != nullptr && !g_sessionMgr.isSessionExist(sessionName)) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "rule_engine_get_duty_code failed, session '%s' not exist", sessionName.get()->c_str());
		Logger::getRuleLogger()->error(errCtx.errorMsgBuf);
		return HANDLE_RESULT(queryParams, request, &errCtx);
	}

	oatpp::String jsonName = getHttpParameter(queryParams, request, "file");
	oatpp::String sessionStr = getHttpParameter(queryParams, request, "sessionName");
	oatpp::String requestSysName = getHttpParameter(queryParams, request, "sys");
	bool _isServiceMode = isServiceMode(requestSysName);

	try {
		SessionLock sessionLock(&g_sessionMgr, sessionName.get()->c_str());  //lock on constrution, unlock on obj at the end of scope

		/* 调用RuleEngine */
		auto dbData = g_sessionMgr.getData(sessionName);
		dbData->setIsServiceMode(_isServiceMode);
		ret = rule_engine_get_duty_code(&errCtx, sessionName.get()->c_str(), dbData, g_sessionMgr.getRuleEngine(sessionName), jsonName.get()->c_str(), sessionStr.get()->c_str());
		if (ret != 0) {
			Logger::getRuleLogger()->error("rule_engine_get_duty_code ret={}, errCtx.errorMsgBuf={}", ret, errCtx.errorMsgBuf);
		}
	}
	catch (char* ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex);
		Logger::getRuleLogger()->error("get_duty_code EXCEP: {}", ex);
	}
	catch (std::string& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.c_str());
		Logger::getRuleLogger()->error("get_duty_code EXCEP: {}", ex.c_str());
	}
	catch (std::exception& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.what());
		Logger::getRuleLogger()->error("get_duty_code EXCEP: {}", ex.what());
	}
	catch (...) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "general exception");
		Logger::getRuleLogger()->error("get_duty_code EXCEP: {}", "general exception");
	}
	return HANDLE_RESULT(queryParams, request, &errCtx);
}

std::shared_ptr<oatpp::web::protocol::http::outgoing::Response> HttpController::handle_update_basedata(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request) {
	ErrorContext errCtx = { 0 };
	long long scenarioId = 0;
	int ret = 0;

	//check session
	oatpp::String sessionName = getHttpParameter(queryParams, request, "sessionName");
	if (sessionName.get() != nullptr && !g_sessionMgr.isSessionExist(sessionName)) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "update_basedata failed, session '%s' not exist", sessionName.get()->c_str());
		Logger::getRuleLogger()->error(errCtx.errorMsgBuf);
		return HANDLE_RESULT(queryParams, request, &errCtx);
	}

	//从参数file文件中读取数据内容
	oatpp::String fileName = getHttpParameter(queryParams, request, "file");
	oatpp::String type = getHttpParameter(queryParams, request, "type");
	oatpp::String scenarioStr = getHttpParameter(queryParams, request, "scenarioId");
	scenarioId = atoll(scenarioStr.get()->c_str());

	oatpp::String requestSysName = getHttpParameter(queryParams, request, "sys");
	bool _isServiceMode = isServiceMode(requestSysName);

	try {
		//加载临时缓存数据
		shared_ptr<CrewDataContext> requestDbData = std::make_shared<CrewDataContext>();
		char filepath[1024] = { 0 };
		_snprintf(filepath, sizeof(filepath) - 1, "%s/inbox/roster/%s", g_rootDir, fileName.get()->c_str());
		ret = requestDbData->loadDataCsv(filepath);
		if (ret != 0) {
			Logger::getRuleLogger()->error("loadDataCsv ret={}, load update basedata failed.", ret);
		}
		requestDbData->setIsServiceMode(_isServiceMode);

		SessionLock sessionLock(&g_sessionMgr, sessionName.get()->c_str());  //lock on constrution, unlock on obj at the end of scope

		/* 调用RuleEngine */
		auto dbData = g_sessionMgr.getData(sessionName);
		dbData->setIsServiceMode(_isServiceMode);
		ret = rule_engine_update_basedata(&errCtx, sessionName.get()->c_str(), requestDbData, dbData, g_sessionMgr.getRuleEngine(sessionName), scenarioId, fileName.get()->c_str(), type.get()->c_str());
		if (ret != 0) {
			Logger::getRuleLogger()->error("rule_engine_update_basedata ret={}, errCtx.errorMsgBuf={}", ret, errCtx.errorMsgBuf);
		}
	}
	catch (char * ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex);
		Logger::getRuleLogger()->error("handle_update_basedata EXCEP: {}", ex);
	}
	catch (std::string& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.c_str());
		Logger::getRuleLogger()->error("handle_update_basedata EXCEP: {}", ex.c_str());
	}
	catch (std::exception& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.what());
		Logger::getRuleLogger()->error("handle_update_basedata EXCEP: {}", ex.what());
	}
	catch (...) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "general exception");
		Logger::getRuleLogger()->error("handle_update_basedata EXCEP: {}", "general exception");
	}
	return HANDLE_RESULT(queryParams, request, &errCtx);
}

std::shared_ptr<oatpp::web::protocol::http::outgoing::Response> HttpController::handle_update_scenario(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request) {
	ErrorContext errCtx = { 0 };
	long long scenarioId = 0;
	int ret = 0;

	//check session
	oatpp::String sessionName = getHttpParameter(queryParams, request, "sessionName");
	if (sessionName.get() != nullptr && !g_sessionMgr.isSessionExist(sessionName)) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "update_scenario failed, session '%s' not exist", sessionName.get()->c_str());
		Logger::getRuleLogger()->error(errCtx.errorMsgBuf);
		return HANDLE_RESULT(queryParams, request, &errCtx);
	}

	//从参数file文件中读取数据内容
	oatpp::String fileName = getHttpParameter(queryParams, request, "file");

	oatpp::String scenarioStr = getHttpParameter(queryParams, request, "scenarioId");
	scenarioId = atoll(scenarioStr.get()->c_str());

	oatpp::String requestSysName = getHttpParameter(queryParams, request, "sys");
	bool _isServiceMode = isServiceMode(requestSysName);

	try {
		//加载临时缓存数据
		shared_ptr<CrewDataContext> requestDbData = std::make_shared<CrewDataContext>();
		ret = rule_engine_load_data(requestDbData, scenarioId, fileName.get()->c_str());
		requestDbData->setIsServiceMode(_isServiceMode);
		if (ret != 0) {
			Logger::getRuleLogger()->error("rule_engine_load_data ret={}, load update scenario data failed.", ret);
		}

		SessionLock sessionLock(&g_sessionMgr, sessionName.get()->c_str());  //lock on constrution, unlock on obj at the end of scope

		/* 调用RuleEngine */
		auto dbData = g_sessionMgr.getData(sessionName);
		dbData->setIsServiceMode(_isServiceMode);
		ret = rule_engine_update_scenario(&errCtx, sessionName.get()->c_str(), requestDbData, dbData, g_sessionMgr.getRuleEngine(sessionName), scenarioId, fileName.get()->c_str());

		if (ret != 0) {
			Logger::getRuleLogger()->error("rule_engine_update_scenario ret={}, errCtx.errorMsgBuf={}", ret, errCtx.errorMsgBuf);
		}
	}
	catch (char * ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex);
		Logger::getRuleLogger()->error("handle_update_scenario EXCEP: {}", ex);
	}
	catch (std::string& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.c_str());
		Logger::getRuleLogger()->error("handle_update_scenario EXCEP: {}", ex.c_str());
	}
	catch (std::exception& ex) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), ex.what());
		Logger::getRuleLogger()->error("handle_update_scenario EXCEP: {}", ex.what());
	}
	catch (...) {
		errCtx.errorCode = -1;
		_snprintf(errCtx.errorMsgBuf, sizeof(errCtx.errorMsgBuf), "general exception");
		Logger::getRuleLogger()->error("handle_update_scenario EXCEP: {}", "general exception");
	}
	return HANDLE_RESULT(queryParams, request, &errCtx);
}

std::shared_ptr<oatpp::web::protocol::http::outgoing::Response> HttpController::handle_test(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request, bool alwaysReloadData) {

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
	sort(fileList.begin(), fileList.end(), [](string a, string b)->bool { return a.compare(b) < 0; });

	std::shared_ptr<OutgoingResponse> response = HANDLE_RESULT(queryParams, request, &errCtx);
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
				bool ret = load_scenario_csv(sessionName, filename.c_str());
				if (ret) {
					load_debug_crews_json(sessionName, "DebugCrews");//OP#1966, 划定debug crew范围, 从DebugCrews读入
				}
				else {
					Logger::getRuleLogger()->error("[{}] load scenario failed. file:{}", sessionName, filename);
					return response;
				}
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
			|| string::npos != filename.find("updatePairingComp")
			|| string::npos != filename.find("changeComposition")
			|| string::npos != filename.find("addAdjustKpi")
			|| string::npos != filename.find("deleteAdjustKpi")
			|| string::npos != filename.find("updateFlight")
			|| string::npos != filename.find("updateTraining")
			|| string::npos != filename.find("updateRosterFlight")
			|| string::npos != filename.find("mergeRoster")
			|| string::npos != filename.find("mergePairing")
			) {
			response = handle_update_list(queryParams, request);
		}
		//else if (string::npos != filename.find("updateFlight")) {
		//	response = handle_update_flight(queryParams, request);
		//}
		else if (string::npos != filename.find("tryPairingOnCrew")) {
			response = handle_try_pairing_on_crew(queryParams, request);
		}
		else if (string::npos != filename.find("checkPairing")) {
			response = handle_check_pairing(queryParams, request);
		}
		else if (string::npos != filename.find("updateActivityId")) {
			response = handle_update_list(queryParams, request);
		}
		else if (string::npos != filename.find("checkCrew")) {
			response = handle_check_crew(queryParams, request);
		}
		else if (string::npos != filename.find("updateCrew")) {
			response = handle_update_crew(queryParams, request);
		}
		else if (string::npos != filename.find("RouteActualRest")) {
			response = handle_route_actual_rest(queryParams, request);//OP#1888
		}
		else if (string::npos != filename.find("CrewEntitlement")) {
			response = handle_crew_entitlement(queryParams, request);//OP#1888
		}
		else if (string::npos != filename.find("CrewManday")) {
			response = handle_crew_manday(queryParams, request);//OP#1888
		}
		else if (string::npos != filename.find("CrewPreference")) {
			response = handle_crew_preference(queryParams, request);
		}
		else if (string::npos != filename.find("getDutyCode")) {
			response = handle_get_duty_code(queryParams, request);
		}
		else if (string::npos != filename.find("checkDutyCode")) {
			response = handle_check_duty_code(queryParams, request);
		}
		else if (string::npos != filename.find("tg-leave")) {
			response = handle_get_worry_data(queryParams, request);
		}
		else {
			Logger::getRuleLogger()->warn("TEST for {} NOT implemented", filename.c_str());
		}

		Logger::getRuleLogger()->debug("**DBG mem: {} MB, peak mem: {}", (getProcessCurrentMem() / (1024 * 1024)), (getProcessPeakMem() / (1024 * 1024)));

	}
	g_sessionMgr.release();
	Logger::getRuleLogger()->info("/test END");
	Logger::getRuleConsoleLogger()->info("/test END");
	RuleStatistics::GetInstancePtr()->printLog("rule_statistics.txt");
	//g_ruleSrv_continue = false;

	return response;
}


std::shared_ptr<oatpp::web::protocol::http::outgoing::Response> HttpController::HANDLE_RESULT(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request, ErrorContext* errCtx) {

	std::shared_ptr<OutgoingResponse> response;
	oatpp::String sessionName = getHttpParameter(queryParams, request, "sessionName");
	string msg = "{ \"result\": \"success\"}";
	if (errCtx->errorCode == 0) {
		response = this->createResponse(Status::CODE_200, msg);
	}
	else {
		if (g_sessionMgr.isSessionExist(sessionName)) {
			msg = StringUtils::Format("{ \"result\": \"fail\", \"errorCode\": {0:errorCode}, \"errorMsg\": \"{1:errorMsg}\"}", errCtx->errorCode, errCtx->errorMsgBuf);
		}
		else {
			msg = StringUtils::Format("{ \"result\": \"fail\", \"errorCode\": {0:errorCode}, \"errorMsg\": \"session[{1:sessionName}] not exist\"}", errCtx->errorCode, sessionName.get()->c_str());

		}
		response = this->createResponse(Status::CODE_200, msg);
	}
	return response;
}

std::shared_ptr<oatpp::web::protocol::http::outgoing::Response> HttpController::HANDLE_RESULT(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request, ErrorContext* errCtx, stringstream& responseData) {
	std::shared_ptr<OutgoingResponse> response;
	oatpp::String sessionName = getHttpParameter(queryParams, request, "sessionName");
	string msg = "{ \"result\": \"success\"}";
	if (errCtx->errorCode == 0) {
		msg = StringUtils::Format("{ \"result\": \"success\", \"data\": {0:data}}", responseData.str().c_str());
		response = this->createResponse(Status::CODE_200, msg);
	}
	else {

		if (g_sessionMgr.isSessionExist(sessionName)) {
			msg = StringUtils::Format("{ \"result\": \"fail\", \"errorCode\": {0:errorCode}, \"errorMsg\": \"{1:errorMsg}\"}", errCtx->errorCode, errCtx->errorMsgBuf);
		}
		else {
			msg = StringUtils::Format("{ \"result\": \"fail\", \"errorCode\": {0:errorCode}, \"errorMsg\": \"session[{1:sessionName}] not exist\"}", errCtx->errorCode, sessionName.get()->c_str());

		}
		response = this->createResponse(Status::CODE_200, msg);
	}
	return response;
}

#endif //MONGOOSE