#include "RuleViolation.h"

#include <algorithm>
#include <string>
#include <vector>
#include "../RuleParam.h"

void RuleViolation::AddRuleViolations(SharedPtr<CREW> crew, SharedPtr<ROSTER> roster, Pairing* pairing, Duty * duty, Segment* segment, RULE_VIOLATION* prv, string message)
{
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (crew)
		rv->crewId = crew->idCrew;
	if (roster)
		rv->rosterId = roster->rosterId;
	if (pairing)
		rv->pairingId = pairing->getDbId();
	if (segment)
	{
		rv->startDTUtc = segment->getStartTimeUtcAct();
		rv->endDTUtc = segment->getEndTimeUtcAct();
		rv->segmentId = segment->getDBId();
		rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
	}
	else if (duty)
	{
		rv->startDTUtc = duty->getStartTimeUtcAct();
		rv->endDTUtc = duty->getEndTimeUtcAct();
		rv->dutySequenceNumber = duty->getDutySegNum();
		rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
	}
	else if (pairing)
	{
		rv->startDTUtc = pairing->getStartTimeUtcAct();
		rv->endDTUtc = pairing->getEndTimeUtcAct();
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}
	else if (roster)
	{
		rv->startDTUtc = roster->actStrUtc;
		rv->endDTUtc = roster->actEndUtc;
		rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
	}
	else
	{
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	if (prv)
		rv->violation_msg = prv->violation_msg;
	else
		rv->violation_msg = message;

	this->AddRuleViolations(rv);
}

//若rv已存在则delete, 否则加入 list
void RuleViolation::AddRuleViolations(RULE_VIOLATION* rv)
{
	if (this->_application == PAIRING_OPTIMIZER) { // skip for PO for thread safety
		if (_ruleParam != nullptr) {
			RuleStatistics::GetInstancePtr()->addOptimizerViolatedTimes(_ruleParam->GetId());
		}
		delete rv;
		return;
	}
	if (_ruleParam)
	{
		rv->idRule = _ruleParam->GetId();
		rv->ruleParamId = _ruleParam->GetRuleParamId();
		rv->description = _ruleParam->GetDescription();
		rv->reference = _ruleParam->GetReference();
		rv->ishard = (_ruleParam->GetOverrideAbility() == "H");
        rv->overridebility = _ruleParam->GetOverrideAbility();
        rv->phase = _ruleParam->GetPhase();
	}
	else
	{
		if (rv->idRule <= 0)
		{
			rv->idRule = 0;
			rv->description = "Check general rule";
		}
	}

	bool bFind = false;
	for (vector<RULE_VIOLATION*>::iterator it = _rule_violations->begin(); it != _rule_violations->end(); it++)
	{
		//yuankai.cai 20190514 mantis#5574 当 singlerule为空且 告警信息冲突时 去除告警
		if (rv->idRule == (*it)->idRule && (rv->crewId == (*it)->crewId) && (rv->pairingId == (*it)->pairingId)
			&& (rv->startDTUtc == (*it)->startDTUtc) && ((*it)->violation_msg == rv->violation_msg) 
			&& (rv->phase <= 0 || !_dbData->IsSupportRulePhaseConfig() || (*it)->phase == rv->phase)) {
			bFind = true;
		}
	}
	if (!bFind)
		this->_rule_violations->push_back(rv);
	//20180124 ain, mantis#2765, mem leak
	else {
		delete rv;
	}
}

// ROSCRW-7734 只根据pairingId和法规id，还有开始结束时间判断
bool RuleViolation::ExistRuleViolation(RULE_VIOLATION* rv) {
	bool bFind = false;
	for (vector<RULE_VIOLATION*>::iterator it = _rule_violations->begin(); it != _rule_violations->end(); it++)
	{
		//yuankai.cai 20190514 mantis#5574 当 singlerule为空且 告警信息冲突时 去除告警
		if ((rv->idRule == (*it)->idRule) && (rv->crewId == (*it)->crewId) 
			&& (rv->pairingId == (*it)->pairingId) && (rv->dutySequenceNumber == (*it)->dutySequenceNumber) && (rv->segmentId == (*it)->segmentId)
			&& (rv->startDTUtc == (*it)->startDTUtc) && ((*it)->violation_msg == rv->violation_msg)) {
			bFind = true;
		}
	}
	return bFind;
}

void RuleViolation::SetLegalityMessage(SharedPtr<CREW>& pCrew, string strMessage) {

	RuleStatistics::GetInstancePtr()->addViolatedTimes(_ruleParam == nullptr ? 0 : _ruleParam->GetId());
	string errorMsg = "";
	string ruleid = "[Rule=" + Utility::GetInstancePtr()->ToString(_ruleParam == nullptr ? 0 : _ruleParam->GetId()) + "]";
	pCrew->_isLegal = false;
	errorMsg = ruleid + "[Crew=" + pCrew->idCrew + "]" + strMessage;
	vector<string> violations = pCrew->_vilation_messages;
	if (std::find(violations.begin(), violations.end(), errorMsg) == violations.end())
		pCrew->_vilation_messages.push_back(errorMsg);
	if (std::find(this->_violations->begin(), this->_violations->end(), errorMsg) == this->_violations->end())
		this->_violations->push_back(errorMsg);
	_ruleLegality->isLegal = false;
	_ruleLegality->legalMessage.push_back(errorMsg);
	if (this->DebugMode())
	{
		cout << "[Crew Error] " << errorMsg << endl;
	}
}

void RuleViolation::SetLegalityMessage(SharedPtr<ROSTER> pRoster, bool isRuleLegality, string strMessage, long long ruleId) {
	if (_ruleParam)
		RuleStatistics::GetInstancePtr()->addViolatedTimes(_ruleParam == nullptr ? 0 : _ruleParam->GetId());
	string errorMsg = "";
	string strRuleid;
	if (_ruleParam)
		strRuleid = "[Rule=" + Utility::GetInstancePtr()->ToString(_ruleParam == nullptr ? 0 : _ruleParam->GetId()) + "]";
	if (ruleId > 0)
		strRuleid = "[Rule=" + Utility::GetInstancePtr()->ToString(ruleId) + "]";
	pRoster->_isLegal = false;

	errorMsg = strRuleid + "[Roster=" + Utility::GetInstancePtr()->ToString(pRoster->rosterId) + "]" + strMessage;
	vector<string>::iterator rosterit = std::find(pRoster->_vilation_messages.begin(), pRoster->_vilation_messages.end(), errorMsg);
	vector<string>::iterator thisit = std::find(this->_violations->begin(), this->_violations->end(), errorMsg);

	if (rosterit == pRoster->_vilation_messages.end())
		pRoster->_vilation_messages.push_back(errorMsg);
	if (thisit == this->_violations->end())
		this->_violations->push_back(errorMsg);
	if (isRuleLegality)
	{
		_ruleLegality->isLegal = false;
		_ruleLegality->legalMessage.push_back(errorMsg);
	}
	if (this->DebugMode())
	{
		cout << "[Roster Error] " << errorMsg << endl;
	}
}

void RuleViolation::SetLegalityMessage(Pairing * pPairing, bool isRuleLegality, string strMessage) {
	if (this->_application == PAIRING_OPTIMIZER) {	// skip for PO for thread safety
		if (_ruleParam != nullptr) {
			RuleStatistics::GetInstancePtr()->addOptimizerViolatedTimes(_ruleParam->GetId());
		}
		return;
	}
	RuleStatistics::GetInstancePtr()->addViolatedTimes(_ruleParam == nullptr ? 0 : _ruleParam->GetId());
	string errorMsg = "";
	string ruleid = "[Rule=" + Utility::GetInstancePtr()->ToString(_ruleParam == nullptr ? 0 : _ruleParam->GetId()) + "]";
	pPairing->setLegality(false);

	errorMsg = ruleid + "[Pairing=" + pPairing->getPairingNum() + "]" + strMessage;

	vector<string> violation = pPairing->getViolationMessage();
	vector<string>::iterator pgit = std::find(violation.begin(), violation.end(), errorMsg);
	vector<string>::iterator thisit = std::find(this->_violations->begin(), this->_violations->end(), errorMsg);

	if (pgit == violation.end())
		pPairing->setViolationMessage(errorMsg);
	if (thisit == this->_violations->end())
		this->_violations->push_back(errorMsg);
	if (isRuleLegality) {
		_ruleLegality->isLegal = false;
		_ruleLegality->legalMessage.push_back(errorMsg);
	}
	if (this->DebugMode())
	{
		cout << "[Pairing Error] " << errorMsg << endl;
	}

}

void RuleViolation::SetLegalityMessage(Pairing * pPairing, string strMessage) {
	if (this->_application == PAIRING_OPTIMIZER) {	// skip for PO for thread safety
		if (_ruleParam != nullptr) {
			RuleStatistics::GetInstancePtr()->addOptimizerViolatedTimes(_ruleParam->GetId());
		}
		return;
	}
	RuleStatistics::GetInstancePtr()->addViolatedTimes(_ruleParam == nullptr ? 0 : _ruleParam->GetId());
	string errorMsg = "";
	string ruleid = "[Rule=" + Utility::GetInstancePtr()->ToString(_ruleParam == nullptr ? 0 : _ruleParam->GetId()) + "]";
	pPairing->setLegality(false);

	errorMsg = ruleid + "[Pairing=" + pPairing->getPairingNum() + "]" + strMessage;

	vector<string> violation = pPairing->getViolationMessage();
	vector<string>::iterator pgit = std::find(violation.begin(), violation.end(), errorMsg);
	vector<string>::iterator thisit = std::find(this->_violations->begin(), this->_violations->end(), errorMsg);

	if (pgit == violation.end())
		pPairing->setViolationMessage(errorMsg);
	if (thisit == this->_violations->end())
		this->_violations->push_back(errorMsg);
	if (this->DebugMode())
	{
		cout << "[Pairing Error] " << errorMsg << endl;
	}

}

void RuleViolation::SetLegalityMessage(Duty * pDuty, string strMessage, long long ruleid)
{
	if (this->_application == PAIRING_OPTIMIZER) {	// skip for PO for thread safety
		if (_ruleParam != nullptr) {
			RuleStatistics::GetInstancePtr()->addOptimizerViolatedTimes(_ruleParam->GetId());
		}
		return;
	}
	if (_ruleParam)
		RuleStatistics::GetInstancePtr()->addViolatedTimes(_ruleParam == nullptr ? 0 : _ruleParam->GetId());
	string errorMsg = "";
	string strRuleid;
	if (_ruleParam)
		strRuleid = "[Rule=" + Utility::GetInstancePtr()->ToString(_ruleParam == nullptr ? 0 : _ruleParam->GetId()) + "]";
	else if (ruleid > 0)
		strRuleid = "[Rule=" + Utility::GetInstancePtr()->ToString(ruleid) + "]";
	else
		strRuleid = "[Rule=]";
	pDuty->setLegality(false);
	errorMsg = strRuleid;
	if (_ruleLegality && _ruleLegality->crewIndex >= 0)
		errorMsg += "[Crew=" + this->_dbData->crewList[_ruleLegality->crewIndex]->idCrew + "]";
	errorMsg += "[Pairing=" + Utility::GetInstancePtr()->ToString(pDuty->getPairingId()) + ",Duty ";
	errorMsg += Utility::GetInstancePtr()->ToString(pDuty->getDutySegNum()) + "]" + strMessage;
	vector<string> violations = pDuty->getViolationMessage();
	vector<string>::iterator dutyit = std::find(violations.begin(), violations.end(), errorMsg);
	vector<string>::iterator thisit = std::find(this->_violations->begin(), this->_violations->end(), errorMsg);

	if ((pDuty->getViolationMessage().size() == 0) ||
		(dutyit == violations.end()))
		pDuty->setViolationMessage(errorMsg);
	if ((this->_violations->size() == 0) ||
		(thisit == this->_violations->end()))
		this->AddViolations(errorMsg);
	if (_ruleLegality)
	{
		_ruleLegality->isLegal = false;
		_ruleLegality->legalMessage.push_back(errorMsg);
	}
	if (this->DebugMode())
	{
		cout << "[Duty Error] " << errorMsg << endl;
	}

}

void RuleViolation::SetLegalityMessage(Segment * pSegment, string strMessage) {
	if (this->_application == PAIRING_OPTIMIZER) {	// skip for PO for thread safety
		if (_ruleParam != nullptr) {
			RuleStatistics::GetInstancePtr()->addOptimizerViolatedTimes(_ruleParam->GetId());
		}
		return;
	}
	RuleStatistics::GetInstancePtr()->addViolatedTimes(_ruleParam == nullptr ? 0 : _ruleParam->GetId());
	string errorMsg = "";
	string ruleid = "[Rule=" + Utility::GetInstancePtr()->ToString(_ruleParam == nullptr ? 0 : _ruleParam->GetId()) + "]";
	pSegment->setLegality(false);

	errorMsg = ruleid + "[Pairing=" + pSegment->getPairingNum() + ",Segment=";
	errorMsg += Utility::GetInstancePtr()->ToString(pSegment->getDBId()) + "]" + strMessage;
	vector<string> violation = pSegment->getViolationMessage();
	vector<string>::iterator segit = std::find(violation.begin(), violation.end(), errorMsg);
	vector<string>::iterator thisit = std::find(this->_violations->begin(), this->_violations->end(), errorMsg);

	if (segit == violation.end())
		pSegment->setViolationMessage(errorMsg);
	if (thisit == this->_violations->end())
		this->_violations->push_back(errorMsg);
	//_ruleLegality->isLegal = false;
	if (this->DebugMode())
	{
		cout << "[Segment Error] " << errorMsg << endl;
	}

}

void RuleViolation::SetLegalityMessage(RULE_LEGALITY * pcrew, string strMessage) {
	RuleStatistics::GetInstancePtr()->addViolatedTimes(_ruleParam == nullptr ? 0 : _ruleParam->GetId());
	string errorMsg = "";
	string ruleid = "[Rule=" + Utility::GetInstancePtr()->ToString(_ruleParam == nullptr ? 0 : _ruleParam->GetId()) + "]";
	pcrew->isLegal = false;
	if (this->_dbData->crewList[pcrew->crewIndex]->idCrew.size() > 0) {
		errorMsg = ruleid + "[Crew=" + this->_dbData->crewList[pcrew->crewIndex]->idCrew + "]" + strMessage;
	}
	else
		errorMsg = ruleid + strMessage;
	vector<string>::iterator thisit = std::find(this->_violations->begin(), this->_violations->end(), errorMsg);
	if (thisit == this->_violations->end())
		this->_violations->push_back(errorMsg);
	_ruleLegality->isLegal = false;
	if (this->DebugMode())
	{
		cout << "[Crew1 Error] " << errorMsg << endl;
	}

}

void RuleViolation::AddViolations(string msg) { 
	_violations->push_back(msg); 
}
