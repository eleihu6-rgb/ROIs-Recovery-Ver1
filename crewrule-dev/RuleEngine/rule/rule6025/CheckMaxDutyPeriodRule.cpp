/**
 * @file CheckMaxDutyPeriodRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckMaxDutyPeriodRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/PhaseUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"

bool CheckMaxDutyPeriodRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	if (rosters.empty()) {
		return true;
	}
	SharedPtr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string base = crew->getPrimeBase();
	bool passAllRule = true;
	for (auto& roster : rosters) {
		if (this->_application == ROSTER_OPTIMIZER && roster->source == "PA") {
			continue;
		}
		if (roster->pairing != nullptr) {
			bool valid = CheckRule(roster->pairing->getDutyVec(), roster);
			if (!valid) {
				passAllRule = false;
			}
		}
		else {
			bool valid = CheckRule(roster, base);
			if (!valid) {
				passAllRule = false;
			}
		}

	}
	return passAllRule;
}

bool CheckMaxDutyPeriodRule::CheckRule(const Pairing* pairing) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	return CheckRule(pairing->getDutyVec(), nullptr);
}

bool CheckMaxDutyPeriodRule::CheckRule(const Duty* duty) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	return CheckRule(duties, nullptr);
}

bool CheckMaxDutyPeriodRule::CheckRule(const ROSTER* roster, const std::string& base) const {
	bool valid = true;
	if (roster->pairing == nullptr && roster->isMergeDpWithNext) {
		//地面任务的DP被合并下一个Roster，则该地面任务不用检查
		return true;
	}
	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);
		
		if (roster != nullptr && !PhaseUtils::IsChecked(roster, ruleParam.GetPhase(), this->_dbData)) {
			continue;
		}

		valid = CheckRule(roster, base, ruleParam);
		if (!valid) {
			if (!this->IsCheckAllRule()) {
				break;
			}
		}
	}
	return valid;
}

bool CheckMaxDutyPeriodRule::CheckRule(const ROSTER* roster, const std::string& base, const LimitMaxDutyPeriodRuleParam& ruleParam) const {
	bool next = true;
	if (ruleParam.MatchParam(*roster, base)) {

		if (ruleParam._maxDPMinutes >= 0) {
			int actualDPMin = RosterUtils::GetDutyPeriodInSecsForGround(roster, this->GetDataContext()) / 60;
			if (this->_dbData->scenario.airline == "TG") {
				actualDPMin = roster->dpMinutes;
				int mergeDP = const_cast<ROSTER*>(roster)->dutyValues.getMergeDp(0);
				if (mergeDP > 0) {
					actualDPMin = mergeDP;
				}
			}
			if (actualDPMin > ruleParam._maxDPMinutes) {
				_ruleViolation.SetParam("actualDP", TimeUtils::MinutesTohhmm(actualDPMin));
				ThrowRuleViolationForDP(roster, ruleParam);
			}
		}

		int actualDuration = static_cast<int>(roster->getRestStartUtcAct() - roster->getStartTimeUtcAct()) / 60;
		if ( (ruleParam._maxDurationMinutes >= 0 && actualDuration > ruleParam._maxDurationMinutes) || (ruleParam._minDurationMinutes >=0 && actualDuration < ruleParam._minDurationMinutes)) {
			_ruleViolation.SetParam("actualDuration", TimeUtils::MinutesTohhmm(actualDuration));
			ThrowRuleViolationForDuration(roster, ruleParam);
		}
	}
	return next;
}

bool CheckMaxDutyPeriodRule::CheckRule(const vector<Duty*>& duties, const ROSTER* roster) const {
	if (duties.empty()) {
		return true;
	}

	std::string base; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = duties.front()->getDepStationRead(); // PO can't get pairing from either duty or segments
	}

	bool passAllRule = true;
	for (std::size_t i = 0; i < duties.size(); ++i) {
		auto& duty = duties[i];
		for (const auto& ruleParam : _ruleParams) {
			_ruleViolation.SetRuleParam(ruleParam);

			if (duty != nullptr && !PhaseUtils::IsChecked(duty, ruleParam.GetPhase(), this->_dbData)) {
				continue;
			}

			bool valid = CheckRule(duty, base, roster, ruleParam);
			if (!valid) {
				passAllRule = false;
				if (!this->IsCheckAllRule()) {
					break;
				}
			}
		}
	}
	return passAllRule;
}

//检查飞行任务
bool CheckMaxDutyPeriodRule::CheckRule(const Duty* duty, const std::string& base, const ROSTER* roster, const LimitMaxDutyPeriodRuleParam& ruleParam) const {
	bool valid = true;
	if (ruleParam.MatchParam(*duty, base)) {
		//if (ruleParam._maxDPMinutes >= 0) {
		//	int actualDPMin = duty->getDPInSecs() / 60;

		//	if (actualDPMin > ruleParam._maxDPMinutes) {
		//		_ruleViolation.SetParam("actualDP", TimeUtils::MinutesTohhmm(actualDPMin));
		//		_ruleViolation.SetParam("maxDP", ruleParam._maxDP);
		//		ThrowRuleViolationForDP(duty);
		//	}
		//}

		int actualDuration = static_cast<int>(duty->getLastDebrief()->getEndUtc() - duty->getFirstBreif()->getStartUtc()) / 60;
		if ( (ruleParam._maxDurationMinutes >= 0 && actualDuration > ruleParam._maxDurationMinutes) || (ruleParam._minDurationMinutes >= 0 && actualDuration < ruleParam._minDurationMinutes)) {
			valid = false;
			_ruleViolation.SetParam("actualDuration", TimeUtils::MinutesTohhmm(actualDuration));
			ThrowRuleViolationForDuration(duty,	roster, ruleParam);
		}
	}
	return valid;
}


void CheckMaxDutyPeriodRule::ThrowRuleViolationForDP(const ROSTER* roster, const LimitMaxDutyPeriodRuleParam& ruleParam) const {
	time_t startUtc = roster->actStrUtc;
	time_t endUtc = roster->actEndUtc;
	
	char startUtcStr[30] = { 0 };
	char endUtcStr[30] = { 0 };
	Utility::GetInstancePtr()->UTCToUTCStr(roster->actStrLoc, startUtcStr, sizeof(startUtcStr));
	Utility::GetInstancePtr()->UTCToUTCStr(roster->actEndLoc, endUtcStr, sizeof(endUtcStr));

	string actualDP = _ruleViolation.GetParam("actualDP");
	std::string msg = "Actual duty period ({0:actualDP}) is more than the maximum duty period ({1:maxDP}).";
	msg = StringUtils::Format(msg, actualDP, ruleParam._maxDP);
	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->rosterId = roster->rosterId;
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	//OP#1448提供message参数给gantt
	rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
	rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
	rv->operation_result.insert(pair<string, string>("actualDP", actualDP));
	rv->operation_result.insert(pair<string, string>("maxDP", ruleParam._maxDP));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckMaxDutyPeriodRule::ThrowRuleViolationForDuration(const ROSTER* roster, const LimitMaxDutyPeriodRuleParam& ruleParam) const {
	time_t startUtc = roster->actStrUtc;
	time_t endUtc = roster->actEndUtc;

	char startUtcStr[30] = { 0 };
	char endUtcStr[30] = { 0 };
	Utility::GetInstancePtr()->UTCToUTCStr(roster->actStrLoc, startUtcStr, sizeof(startUtcStr));
	Utility::GetInstancePtr()->UTCToUTCStr(roster->actEndLoc, endUtcStr, sizeof(endUtcStr));

	string actualDuration = _ruleViolation.GetParam("actualDuration");
	std::string msg = "Actual duration doesn't meet the requirement.";
	if (ruleParam._maxDurationMinutes >= 0 && ruleParam._minDurationMinutes >= 0) {
		msg = "Actual duration ({0:actualDuration}) doesn't meet the requirement ({1:minDuration}-{2:maxDuration}).";
		msg = StringUtils::Format(msg, actualDuration, ruleParam._minDuration, ruleParam._maxDuration);
	}
	else if (ruleParam._maxDurationMinutes >= 0) {
		msg = "Actual duration ({0:actualDuration}) is more than the maximum duration ({1:maxDuration}).";
		msg = StringUtils::Format(msg, actualDuration, ruleParam._maxDuration);
	}
	else if (ruleParam._minDurationMinutes >= 0) {
		msg = "Actual duration ({0:actualDuration}) is less than the minimum duration ({1:minDuration}).";
		msg = StringUtils::Format(msg, actualDuration, ruleParam._minDuration);
	}
	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;;
	rv->rosterId = roster->rosterId;
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	//OP#1448提供message参数给gantt
	rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
	rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
	rv->operation_result.insert(pair<string, string>("actualDuration", actualDuration));
	rv->operation_result.insert(pair<string, string>("minDuration", ruleParam._minDuration));
	rv->operation_result.insert(pair<string, string>("maxDuration", ruleParam._maxDuration));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckMaxDutyPeriodRule::ThrowRuleViolationForDuration(const Duty* duty, const ROSTER* roster, const LimitMaxDutyPeriodRuleParam& ruleParam) const {
	time_t startUtc = duty->getStartTimeUtcAct();
	time_t endUtc = duty->getEndTimeUtcAct();

	char startUtcStr[30] = { 0 };
	char endUtcStr[30] = { 0 };
	Utility::GetInstancePtr()->UTCToUTCStr(duty->getStartTimeLocAct(), startUtcStr, sizeof(startUtcStr));
	Utility::GetInstancePtr()->UTCToUTCStr(duty->getEndTimeLocAct(), endUtcStr, sizeof(endUtcStr));

	string actualDuration = _ruleViolation.GetParam("actualDuration");
	std::string msg = "Actual duration doesn't meet the requirement.";
	if (ruleParam._maxDurationMinutes >= 0 && ruleParam._minDurationMinutes >= 0) {
		msg = "Actual duration ({0:actualDuration}) doesn't meet the requirement ({1:minDuration}-{2:maxDuration}).";
		msg = StringUtils::Format(msg, actualDuration, ruleParam._minDuration, ruleParam._maxDuration);
	}
	else if (ruleParam._maxDurationMinutes >= 0) {
		msg = "Actual duration ({0:actualDuration}) is more than the maximum duration ({1:maxDuration}).";
		msg = StringUtils::Format(msg, actualDuration, ruleParam._maxDuration);
	}
	else if (ruleParam._minDurationMinutes >= 0) {
		msg = "Actual duration ({0:actualDuration}) is less than the minimum duration ({1:minDuration}).";
		msg = StringUtils::Format(msg, actualDuration, ruleParam._minDuration);
	}
	
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = CheckMaxDutyPeriodRule::RuleFuncId;
	rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySeq();
	rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, duty->getPairingId());
		rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
	}
	else {
		rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
		//_ruleViolation.SetLegalityMessage(const_cast<Duty*>(duty), msg, CheckMaxDutyPeriodRule::RuleFuncId);
	}
	rv->startDTUtc = duty->getStartTimeUtcAct();
	rv->endDTUtc = duty->getEndTimeUtcAct();
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
	rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
	rv->operation_result.insert(pair<string, string>("actualDuration", actualDuration));
	rv->operation_result.insert(pair<string, string>("minDuration", ruleParam._minDuration));
	rv->operation_result.insert(pair<string, string>("maxDuration", ruleParam._maxDuration));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckMaxDutyPeriodRule::ParseParam(const InputType& input) {
	//添加DBRule支持
	for (const auto& dbRule: input.dbRules) {
		_ruleParams.emplace_back(LimitMaxDutyPeriodRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString: input.ruleParamString) {
        _ruleParams.emplace_back(LimitMaxDutyPeriodRuleParam(this));
        auto& newParam = _ruleParams.back();
        newParam.ParseParam(singleRuleParamString);
    }
}

