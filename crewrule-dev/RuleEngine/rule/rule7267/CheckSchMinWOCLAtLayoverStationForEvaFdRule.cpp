/**
 * @file SchMinWOCLAtLayoverStationForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckSchMinWOCLAtLayoverStationForEvaFdRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/SchDutyUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "TimezoneUtils.h"

bool CheckSchMinWOCLAtLayoverStationForEvaFdRule::CheckRule(const Pairing* pairing) const {
	if (_ruleParams.empty()) {
		return true;
	}
	bool passAllRule = true;
	bool next = true;
	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);
		_ruleViolation.SetParam("minRestAtLayover", ruleParam._strMinRestAtLayover);
		_ruleViolation.SetParam("minSleepCycles", ruleParam._strMinSleepCycles);
		bool valid = CheckRule(next, pairing, ruleParam);
		if (!valid) {
			passAllRule = false;
		}
		if (!next) {
			break;
		}
	}
	return passAllRule;
}

bool CheckSchMinWOCLAtLayoverStationForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	if (rosters.empty()) {
		return true;
	}
	time_t checkedStartTime = 0, checkedEndTime = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		checkedStartTime = this->_dbData->scenario.startDtUTC;
		checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		checkedStartTime = rosters[0]->actStrUtc;
		checkedEndTime = rosters[rosters.size() - 1]->restStrUtc;
	}
	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];

	bool passAllRule = true;
	bool next = true;

	for (auto& roster : rosters) {
		if (roster->pairing == nullptr) {
			continue;
		}
		_ruleViolation.SetParam("rosterId", StringUtils::lltos(roster->rosterId));
		
		for (const auto& ruleParam : _ruleParams) {
			_ruleViolation.SetRuleParam(ruleParam);
			_ruleViolation.SetParam("minRestAtLayover", ruleParam._strMinRestAtLayover);
			_ruleViolation.SetParam("minSleepCycles", ruleParam._strMinSleepCycles);

			if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
				continue;
			}
			bool valid = CheckRule(next, roster->pairing, ruleParam);
			if (!valid) {
				passAllRule = false;
			}
			if (!passAllRule) {
				if (!IsCheckAllRule()) {
					return passAllRule;
				}
			}
			if (!next) {
				break;
			}
		}
	}

	return passAllRule;
}

bool CheckSchMinWOCLAtLayoverStationForEvaFdRule::CheckRule(bool& next, const Pairing* pairing, const SchMinWOCLAtLayoverStationForEvaFdRuleParam& ruleParam) const {
	bool valid = true;
	next = true;

	//当前Pairing没有货机机型，则不用按计划时间进行检查
	if (!SchDutyUtils::existFleetsInPairing(pairing)) {
		return false;
	}

	auto& duties = pairing->getDutyVec();
	for (size_t i = 0; i < duties.size(); i++) {
		Duty* currDuty = duties.at(i);
		Duty* nextDuty = (i + 1) >= duties.size() ? nullptr : duties.at(i + 1);
        if (nextDuty == nullptr) break;

		if (ruleParam.MatchParam(currDuty, nextDuty, pairing)) {

			int warnCode = ruleParam.CheckParam(currDuty, nextDuty);

			if (((warnCode & (int)SchMinWOCLAtLayoverStationForEvaFdRuleParam::WarnCode::MIN_REST_AT_LAYOVER_WARN) == (int)SchMinWOCLAtLayoverStationForEvaFdRuleParam::WarnCode::MIN_REST_AT_LAYOVER_WARN) &&
				((warnCode & (int)SchMinWOCLAtLayoverStationForEvaFdRuleParam::WarnCode::MIN_WOCL_AT_LAYOVER_WARN) == (int)SchMinWOCLAtLayoverStationForEvaFdRuleParam::WarnCode::MIN_WOCL_AT_LAYOVER_WARN)) {
				valid = false;
				ThrowRuleViolationForMinRestAndMinWOCL(currDuty);
			}
			else if ((warnCode & (int)SchMinWOCLAtLayoverStationForEvaFdRuleParam::WarnCode::MIN_REST_AT_LAYOVER_WARN) == (int)SchMinWOCLAtLayoverStationForEvaFdRuleParam::WarnCode::MIN_REST_AT_LAYOVER_WARN) {
				valid = false;
				ThrowRuleViolationForMinRest(currDuty);
			}
			else if ((warnCode & (int)SchMinWOCLAtLayoverStationForEvaFdRuleParam::WarnCode::MIN_WOCL_AT_LAYOVER_WARN) == (int)SchMinWOCLAtLayoverStationForEvaFdRuleParam::WarnCode::MIN_WOCL_AT_LAYOVER_WARN) {
				valid = false;
				ThrowRuleViolationForMinWOCL(currDuty);
			}
			next = false;
			break;
		}
	}

	return valid;
}

void CheckSchMinWOCLAtLayoverStationForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(SchMinWOCLAtLayoverStationForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(SchMinWOCLAtLayoverStationForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void CheckSchMinWOCLAtLayoverStationForEvaFdRule::ThrowRuleViolationForMinRestAndMinWOCL(const Duty* duty) const {
	string minRestAtLayover = _ruleViolation.GetParam("minRestAtLayover");
	string minSleepCycles = _ruleViolation.GetParam("minSleepCycles");

	std::string msg = "The consecutive rest at the layover station is less than minimum required rest({0:minRestAtLayover}), and the number of sleep cycles is less than the minimum required number of sleep cycles({1:minSleepCycles}).";
	msg = StringUtils::Format(msg, minRestAtLayover, minSleepCycles);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = StringUtils::stoll(_ruleViolation.GetParam("rosterId"), -1);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySeq();
	rv->startDTUtc = duty->getStartTimeUtcSch();
	rv->endDTUtc = duty->getEndTimeUtcSch();
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("minRestAtLayover", minRestAtLayover));
	rv->operation_result.insert(pair<string, string>("minSleepCycles", minSleepCycles));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckSchMinWOCLAtLayoverStationForEvaFdRule::ThrowRuleViolationForMinRest(const Duty* duty) const{
	string minRestAtLayover = _ruleViolation.GetParam("minRestAtLayover");

	std::string msg = "The consecutive rest at the layover station is less than the minumum required rest({0:minRestAtLayover}).";
	msg = StringUtils::Format(msg, minRestAtLayover);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = StringUtils::stoll(_ruleViolation.GetParam("rosterId"), -1);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySeq();
	rv->startDTUtc = duty->getStartTimeUtcSch();
	rv->endDTUtc = duty->getEndTimeUtcSch();
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("minRestAtLayover", minRestAtLayover));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckSchMinWOCLAtLayoverStationForEvaFdRule::ThrowRuleViolationForMinWOCL(const Duty* duty) const {
	string minSleepCycles = _ruleViolation.GetParam("minSleepCycles");

	std::string msg = "The number of sleep cycles is less than the minimum required number of sleep cycles({0:minSleepCycles}).";
	msg = StringUtils::Format(msg, minSleepCycles);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = StringUtils::stoll(_ruleViolation.GetParam("rosterId"), -1);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySeq();
	rv->startDTUtc = duty->getStartTimeUtcSch();
	rv->endDTUtc = duty->getEndTimeUtcSch();
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("minSleepCycles", minSleepCycles));
	_ruleViolation.AddRuleViolations(rv);
}

