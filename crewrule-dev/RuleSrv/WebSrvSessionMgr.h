#ifndef WEBSRVSESSION_H
#define WEBSRVSESSION_H
#include <string>
#include <map>
#include <memory>
#include <mutex>
#include "CrewDB.h"
#include "../RuleEngine/RuleEngine.h"

using namespace std;


class WebSrvSession;

class WebSrvSessionMgr {
public:
	~WebSrvSessionMgr();
	bool isSessionExist(const string sessionName);
	bool addSession(const string sessionName);
	bool destroySession(const string sessionName);
	shared_ptr<CrewDataContext> getData(const string sessionName, const bool isRequestScope=false, const string requestTransactionId= "");
	shared_ptr<LegalityChecker> getRuleEngine(const string sessionName, const bool isRequestScope=false, const string requestTransactionId="");

	shared_ptr<WebSrvSession>& getSession(const string sessionName);

	bool lockSession(const string sessionName);
	bool unlockSession(const string sessionName);

	void endTransaction(const string requestTransactionId);

	void release();

	std::size_t size();
private:

	map<string, shared_ptr<WebSrvSession>> sessionNameMap;

	map<string, std::tuple<string, shared_ptr<CrewDataContext>, time_t>> requestTransactionDataMap;//map<transactionId, tuple<sessionName,CrewDataContext,createTime>>

	map<string, std::tuple<string, shared_ptr<LegalityChecker>, time_t>> requestTransactionCheckerMap;//map<transactionId, tuple<sessionName,LegalityChecker,createTime>>

	//强制释放超时事务
	void releaseTransaction();

	mutex sessionNameMapLock;
};

class WebSrvSession {
public:
	WebSrvSession(const string name);
	~WebSrvSession();
	string getName();

	//isRequestScope:是否仅作用当前请求，构造临时缓存
	shared_ptr<CrewDataContext> getData(const bool isRequestScope = false);

	//isRequestScope:是否仅作用当前请求，构造临时LegalityChecker
	shared_ptr<LegalityChecker> getRuleEngine(const bool isRequestScope = false);

	//设置Data
	void setData(const shared_ptr<CrewDataContext>& dbData);

	bool lock();//true: success, false: failed
	bool unlock();
private:
	string name;
	shared_ptr<CrewDataContext> data;
	shared_ptr<LegalityChecker> ruleEngine;
	mutex sessionLock;
	mutex copyDataLock;
};
#endif//WEBSRVSESSION_H