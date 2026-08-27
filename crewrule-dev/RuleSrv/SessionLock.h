#ifndef SESSION_LOCK_H
#define SESSION_LOCK_H
#include <string>
#include "WebSrvSessionMgr.h"

//****************************************************
//1、构造函数：从 sessionMgr中 lock指定name
//2、析构函数：从 sessionMgr中 unlock指定name
//3、用于在 try catch流程中完成 lock/unlock对称调用
//****************************************************
class SessionLock {
public:
	SessionLock(WebSrvSessionMgr* sessionMgr, const char* sessionName, const bool isRequestLock = true, const bool isRequestScope=false, const string requestTransactionId="");
	~SessionLock();
private:
	std::string sessionName{};
	bool isRequestScope{false};
	bool isRequestLock{true};
	std::string requestTransactionId{};
	WebSrvSessionMgr* sessionMgr{nullptr};
	shared_ptr<LegalityChecker> legalityChecker{ nullptr };
};

#endif//SESSION_LOCK_H