#include "SessionLock.h"

SessionLock::SessionLock(WebSrvSessionMgr* sessionMgr, const char* sessionName, const bool isRequestLock, const bool isRequestScope, const string requestTransactionId) {
	this->sessionMgr = sessionMgr;
	this->sessionName = sessionName;
	this->isRequestLock = isRequestLock;
	this->isRequestScope = isRequestScope;

	this->requestTransactionId = requestTransactionId;
	if (this->isRequestLock) {
		sessionMgr->lockSession(sessionName);
	}
	this->legalityChecker = sessionMgr->getRuleEngine(sessionName, isRequestScope, requestTransactionId);
	this->legalityChecker->startTransaction();
}

SessionLock::~SessionLock() {
	if (this->legalityChecker == nullptr) {
		this->legalityChecker = sessionMgr->getRuleEngine(sessionName, isRequestScope, requestTransactionId);
	}
	this->legalityChecker->endTransaction();

	if (this->isRequestLock) {
		this->sessionMgr->unlockSession(sessionName);
	}
}