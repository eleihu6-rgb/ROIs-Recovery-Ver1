
#include "WebSrvSessionMgr.h"
#include <map>
#include "configParam.h"

using namespace std;

WebSrvSessionMgr::~WebSrvSessionMgr() {
	//printf("~WebSrvSessionMgr()\n");
	std::lock_guard<std::mutex> lockGuard(sessionNameMapLock);
	sessionNameMap.clear();
}

bool WebSrvSessionMgr::isSessionExist(const string sessionName) {
	std::lock_guard<std::mutex> lockGuard(sessionNameMapLock);
	return sessionNameMap.find(sessionName) != sessionNameMap.end();
}

bool WebSrvSessionMgr::addSession(const string sessionName) {
	if (isSessionExist(sessionName)) {
		Logger::getRuleLogger()->error("addSession failed, session '{}' already exist", sessionName);
		return false;
	}
	shared_ptr<WebSrvSession> session(new WebSrvSession(sessionName));
	//shared_ptr<WebSrvSession> session();
	std::lock_guard<std::mutex> lockGuard(sessionNameMapLock);
	sessionNameMap[sessionName] = session;
	return true;
}

bool WebSrvSessionMgr::destroySession(const string sessionName) {
	if (!isSessionExist(sessionName))
		return true;
	std::lock_guard<std::mutex> lockGuard(sessionNameMapLock);
	shared_ptr<WebSrvSession> session = sessionNameMap[sessionName];
	map<string, shared_ptr<WebSrvSession>>::iterator it = sessionNameMap.find(sessionName);

	bool success = session->lock();
	if (!success) {
		Logger::getRuleLogger()->error("destroy session failed, session is processing");
		return false;
	}
	sessionNameMap.erase(it);

	//移除事务
	set<string> removedTransactionIds;
	for (auto& pair : requestTransactionDataMap) {
		string& _sessionName = std::get<0>(pair.second);
		if (_sessionName == sessionName) {
			removedTransactionIds.emplace(pair.first);
		}
	}
	for (auto& removedTransactionId : removedTransactionIds) {
		requestTransactionDataMap.erase(removedTransactionId);
		requestTransactionCheckerMap.erase(removedTransactionId);
	}

	session->unlock();
	return true;
}

shared_ptr<CrewDataContext> WebSrvSessionMgr::getData(const string sessionName, const bool isRequestScope, const string requestTransactionId) {
	if (!isSessionExist(sessionName)) {
		Logger::getRuleLogger()->error("getData failed, session '{}' not exist", sessionName);
		throw "getData failed, session '" + sessionName + "' not exist";
	}
	releaseTransaction();
	shared_ptr<WebSrvSession> session = nullptr;
	{
		std::lock_guard<std::mutex> lockGuard(sessionNameMapLock);
		session = sessionNameMap[sessionName];
	}
	if (requestTransactionId.empty()) {
		return session->getData(isRequestScope);
	}
	auto iter = requestTransactionDataMap.find(requestTransactionId);
	if (iter != requestTransactionDataMap.end()) {
		return std::get<1>(iter->second);
	}
	shared_ptr<CrewDataContext> dbData = session->getData(isRequestScope);
	requestTransactionDataMap.insert(std::make_pair(requestTransactionId, std::make_tuple(sessionName, dbData, time(0))));
	return dbData;
}

shared_ptr<LegalityChecker> WebSrvSessionMgr::getRuleEngine(const string sessionName, const bool isRequestScope, const string requestTransactionId) {
	if (!isSessionExist(sessionName)) {
		Logger::getRuleLogger()->error("getRuleEngine failed, session '{}' not exist", sessionName);
		throw "getRuleEngine failed, session '" + sessionName + "' not exist";
	}
	releaseTransaction();
	shared_ptr<WebSrvSession> session = nullptr;
	{
		std::lock_guard<std::mutex> lockGuard(sessionNameMapLock);
		session = sessionNameMap[sessionName];
	}
	if (requestTransactionId.empty()) {
		return session->getRuleEngine(isRequestScope);
	}

	auto iter = requestTransactionCheckerMap.find(requestTransactionId);
	if (iter != requestTransactionCheckerMap.end()) {
		return std::get<1>(iter->second);
	}
	shared_ptr<LegalityChecker> checker = session->getRuleEngine(isRequestScope);
	requestTransactionCheckerMap.insert(std::make_pair(requestTransactionId, std::make_tuple(sessionName, checker, time(0))));
	return checker;
}

shared_ptr<WebSrvSession>& WebSrvSessionMgr::getSession(const string sessionName) {
	if (!isSessionExist(sessionName)) {
		Logger::getRuleLogger()->error("getSession failed, session '{}' not exist", sessionName);
		throw "getSession failed, session '" + sessionName + "' not exist";
	}
	return sessionNameMap[sessionName];
}

bool WebSrvSessionMgr::lockSession(const string sessionName) {
	if (!isSessionExist(sessionName)) {
		Logger::getRuleLogger()->error("lockSession failed, session '{}' not exist", sessionName);
		return true;
	}

	bool locked = sessionNameMap[sessionName]->lock();
	if (!locked) {
		Logger::getRuleLogger()->error("lockSession failed, session '{}' is already processing", sessionName);
		return false;
	}
	return true;
}
bool WebSrvSessionMgr::unlockSession(const string sessionName) {
	if (!isSessionExist(sessionName)) {
		Logger::getRuleLogger()->error("unlockSession failed, session '{}' not exist", sessionName);
		return true;
	}
	return sessionNameMap[sessionName]->unlock();
}

std::size_t WebSrvSessionMgr::size() {
	return this->sessionNameMap.size();
}

void WebSrvSessionMgr::endTransaction(const string requestTransactionId) {
	requestTransactionDataMap.erase(requestTransactionId);
	requestTransactionCheckerMap.erase(requestTransactionId);
}

void WebSrvSessionMgr::releaseTransaction() {
	time_t now = time(0);
	int timeout = 60 * 60;//超过60分钟，则就清除事务

	for (auto iter = requestTransactionDataMap.begin(); iter != requestTransactionDataMap.end(); ) {
		int cost = static_cast<int>(now - std::get<2>(iter->second));
		if (cost > timeout) {
			//超时则就清除事务
			iter = requestTransactionDataMap.erase(iter);
		}
		else {
			++iter;
		}
	}

	for (auto iter = requestTransactionCheckerMap.begin(); iter != requestTransactionCheckerMap.end(); ) {
		int cost = static_cast<int>(now - std::get<2>(iter->second));
		if (cost > timeout) {
			//超时则就清除事务
			iter = requestTransactionCheckerMap.erase(iter);
		}
		else {
			++iter;
		}
	}
}

void WebSrvSessionMgr::release() {
	sessionNameMap.clear();
}

//mantis#1470, ruleSrv启动dataCtx增加参数 appType=RULE_SRV, 帮助确定应读取哪个配置文件
WebSrvSession::WebSrvSession(const string name) : name(name), data(shared_ptr<CrewDataContext>(new CrewDataContext(CREW_APP_TYPE_RULESRV))), ruleEngine(shared_ptr<LegalityChecker>(new LegalityChecker())) {
	data->configDataSource = g_dataSource;
	data->configDataSourceUrl = g_dataSourceServerUtl;
	//ruleEngine->setDataContext(this->data);
}

WebSrvSession::~WebSrvSession() {
	Logger::getRuleLogger()->debug("destructing WebSrvSession()...");
	fflush(stdout);
}

string WebSrvSession::getName() { 
	return name; 
}

shared_ptr<CrewDataContext> WebSrvSession::getData(const bool isRequestScope) {
	if (isRequestScope) {
		long long lockLapsed = clock();
		Logger::getRuleLogger()->debug("[WebSrvSession::getData] [{}] lock start", name);
		std::lock_guard<std::mutex> lockGuard(copyDataLock);
		auto _db = CrewDataContext::createTransactionData(data);
		Logger::getRuleLogger()->debug("[WebSrvSession::getData] [{}] lock end, cost {} ms.", name, ((clock() - lockLapsed) * 1000) / CLOCKS_PER_SEC);
		return _db;
	}
	return data;
}

shared_ptr<LegalityChecker> WebSrvSession::getRuleEngine(const bool isRequestScope) { 
	if (isRequestScope) {
		//获得当前请求会话Session的LegalityChecker
		shared_ptr<LegalityChecker> checker = std::make_shared<LegalityChecker>();
		checker->copyTransactionData(ruleEngine.get());
		return checker;
	}
	return ruleEngine; 
}

void WebSrvSession::setData(const shared_ptr<CrewDataContext>& dbData) {
	this->data = dbData;
}

bool WebSrvSession::lock() 
{ 
	//return this->sessionLock.try_lock(); 
	this->sessionLock.lock(); 
	return true;
} //true: success, false: failed

bool WebSrvSession::unlock() { 
	this->sessionLock.unlock(); 
	return true;
}
