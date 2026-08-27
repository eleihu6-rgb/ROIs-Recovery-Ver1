/**
 * @file CheckMinRestBasedLocalNightForPRRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckMinRestBasedLocalNightForPRRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/AssignmentUtils.h"
//#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

bool CheckMinRestBasedLocalNightForPRRule::CheckRule(const Pairing* pairing) const {
	if (pairing == nullptr || this->_ruleParams.empty()) {
		return true;
	}

	auto& duties = pairing->getDutyVec();
	if (duties.size() <= 1) {
		return true;
	}

	std::string base = pairing->getBase();

	bool passAllRule = true;
	for (const auto& _ruleParam : _ruleParams) {
		if (_ruleParam.GetClassType() == RuleClassType::PO) {
			continue;
		}
		_ruleViolation.SetRuleParam(_ruleParam);
		for (std::size_t i = 0; i < duties.size() - 1; i++) {
			Duty* currDuty = duties.at(i);
			Duty* nextDuty = duties.at(i + 1);
			bool valid = CheckRule(currDuty, nextDuty, base, _ruleParam);
			if (!valid) {
				passAllRule = false;
				if (!this->IsCheckAllRule()) {
					return passAllRule;
				}
			}
		}
	}
	return passAllRule;
}

bool CheckMinRestBasedLocalNightForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}
	bool passAllRule = true;

	auto workPeriods = WorkPeriod::GetWorkPeriods(rosters, this->_dbData);

	if (workPeriods.empty())
		return true;

	for (auto& _ruleParam : _ruleParams) {
		if (_ruleParam.GetClassType() == RuleClassType::PO) {
			continue;
		}
		_ruleViolation.SetRuleParam(_ruleParam);

		for (size_t i = 0; i < workPeriods.size() - 1; i++) {
			auto& currentWorkPeriod = workPeriods.at(i);
			auto& nextWorkPeriod = workPeriods.at(i + 1);

			if (!CheckRule(currentWorkPeriod, nextWorkPeriod, _ruleParam)) {
				passAllRule = false;
				if (!this->IsCheckAllRule()) {
					return passAllRule;
				}
			}
		}
	}
	return passAllRule;
}

bool CheckMinRestBasedLocalNightForPRRule::CheckRule(const Duty* currDuty, const Duty* nextDuty, const string& base, const MinRestBasedLocalNightForPRRuleParam& ruleParam) const {
	bool valid = true;

	time_t actRestStartTimeLoc = currDuty->getLastDropoff()->getEndTimeLocAct();
	time_t actRestEndTimeLoc = nextDuty->getFirstPickup()->getStartTimeLocAct();

	//规则1：检查实际休息时间是否满足本地夜晚要求
	int localNightNum = DutyUtils::GetLocalNightNums(actRestStartTimeLoc, actRestEndTimeLoc, 0);
	if (localNightNum >= 1) {
		//实际休息时间满足本地夜晚要求，则退出
		return true;
	}

	//规则2：检查Layover和Base是否满足最小休息时长
	int actRestMinutes = (int)((actRestEndTimeLoc - actRestStartTimeLoc) / 60);

	if (ruleParam.MatchParam(*currDuty, base)) {
		if (actRestMinutes < ruleParam._minRestMinutesAtBase) {
			valid = false;
			if (!this->IsCheckAllRule()) {
				return valid;
			}
			ThrowRuleViolation(currDuty, nextDuty, actRestMinutes, ruleParam, true);
		}
	}
	else {
		if (actRestMinutes < ruleParam._minRestMinutesAtLayover) {
			valid = false;
			if (!this->IsCheckAllRule()) {
				return valid;
			}
			ThrowRuleViolation(currDuty, nextDuty, actRestMinutes, ruleParam, false);
		}
	}
	return valid;
}

bool CheckMinRestBasedLocalNightForPRRule::CheckRule(const std::unique_ptr<WorkPeriod>& currWorkPeriod, const std::unique_ptr<WorkPeriod>& nextWorkPeriod, const MinRestBasedLocalNightForPRRuleParam& ruleParam) const {
	bool valid = true;

	time_t actRestStartTimeLoc = currWorkPeriod->GetEndTimeLoc();
	time_t actRestEndTimeLoc = nextWorkPeriod->GetStartTimeLoc();

	//规则1：检查实际休息时间是否满足本地夜晚要求
	int localNightNum = DutyUtils::GetLocalNightNums(actRestStartTimeLoc, actRestEndTimeLoc, 0);
	if (localNightNum >= 1) {
		//实际休息时间满足本地夜晚要求，则退出
		return true;
	}

	//规则2：检查Layover和Base是否满足最小休息时长
	int actRestMinutes = (int)((actRestEndTimeLoc - actRestStartTimeLoc) / 60);

	if (currWorkPeriod->GetWorkType() == WorkType::FltDuty) {
		Duty* currDuty = (Duty*)currWorkPeriod->GetWork();
		if (ruleParam.MatchParam(*currDuty, "")) {
			if (ruleParam._minRestAtBase != RuleParamConstant::IGNORED && actRestMinutes < ruleParam._minRestMinutesAtBase) {
				valid = false;
				if (!this->IsCheckAllRule()) {
					return valid;
				}
				ThrowRuleViolation(currWorkPeriod, nextWorkPeriod, actRestMinutes, ruleParam, true);
			}

			if (ruleParam._minRestAtLayover != RuleParamConstant::IGNORED && actRestMinutes < ruleParam._minRestMinutesAtLayover) {
				valid = false;
				if (!this->IsCheckAllRule()) {
					return valid;
				}
				ThrowRuleViolation(currWorkPeriod, nextWorkPeriod, actRestMinutes, ruleParam, false);
			}
		}
	}
	else {
		if (ruleParam.MatchParam(currWorkPeriod->GetRoster(), "")) {
			if (ruleParam._minRestAtBase != RuleParamConstant::IGNORED && actRestMinutes < ruleParam._minRestMinutesAtBase) {
				valid = false;
				if (!this->IsCheckAllRule()) {
					return valid;
				}
				ThrowRuleViolation(currWorkPeriod, nextWorkPeriod, actRestMinutes, ruleParam, true);
			}

			if (ruleParam._minRestAtLayover != RuleParamConstant::IGNORED && actRestMinutes < ruleParam._minRestMinutesAtLayover) {
				valid = false;
				if (!this->IsCheckAllRule()) {
					return valid;
				}
				ThrowRuleViolation(currWorkPeriod, nextWorkPeriod, actRestMinutes, ruleParam, false);
			}
		}
	}
	return valid;
}

void CheckMinRestBasedLocalNightForPRRule::ThrowRuleViolation(const Duty* currDuty, const Duty* nextDuty, const int actualRest, const MinRestBasedLocalNightForPRRuleParam& ruleParam, const bool isCheckBaseRest) const {
	time_t actRestStartTimeUtc = currDuty->getLastDropoff()->getEndTimeUtcAct();
	time_t actRestEndTimeUtc = nextDuty->getFirstPickup()->getStartTimeUtcAct();

	std::string msg = "The actual rest period ({0:actualRest}) does not include local nights and is less than the minimum required rest ({1:minrest}).";
	msg = StringUtils::Format(msg, TimeUtils::MinutesTohhmm(actualRest), isCheckBaseRest ? ruleParam._minRestAtBase : ruleParam._minRestAtLayover);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = CheckMinRestBasedLocalNightForPRRule::RuleFuncId;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, currDuty->getPairingId());
		rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
	}
	rv->pairingId = currDuty->getPairingId();
	rv->dutySequenceNumber = currDuty->getDutySeq();
	rv->startDTUtc = actRestStartTimeUtc;
	rv->endDTUtc = actRestEndTimeUtc;
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("minRest", isCheckBaseRest ? ruleParam._minRestAtBase : ruleParam._minRestAtLayover));
	rv->operation_result.insert(pair<string, string>("checkType", isCheckBaseRest ? "base" : "layover"));
	rv->operation_result.insert(pair<string, string>("actualRest", TimeUtils::MinutesTohhmm(actualRest)));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckMinRestBasedLocalNightForPRRule::ThrowRuleViolation(const std::unique_ptr<WorkPeriod>& currWorkPeriod, const std::unique_ptr<WorkPeriod>& nextWorkPeriod, const int actualRest, const MinRestBasedLocalNightForPRRuleParam& ruleParam, const bool isCheckBaseRest) const {
	Duty* currDuty = nullptr;
	ROSTER* roster = currWorkPeriod->GetRoster();
	if (currWorkPeriod->GetWorkType() == WorkType::FltDuty) {
		currDuty = (Duty*)currWorkPeriod->GetWork();
	}

	time_t actRestStartTimeUtc = currWorkPeriod->GetEndTimeUTC();
	time_t actRestEndTimeUtc = nextWorkPeriod->GetStartTimeUTC();

	std::string msg = "The actual rest period ({0:actualRest}) does not include local nights and is less than the minimum required rest ({1:minrest}).";
	msg = StringUtils::Format(msg, TimeUtils::MinutesTohhmm(actualRest), isCheckBaseRest ? ruleParam._minRestAtBase : ruleParam._minRestAtLayover);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = CheckMinRestBasedLocalNightForPRRule::RuleFuncId;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
	}
	if (currDuty != nullptr) {
		rv->pairingId = currDuty->getPairingId();
		rv->dutySequenceNumber = currDuty->getDutySeq();
	}
	rv->startDTUtc = actRestStartTimeUtc;
	rv->endDTUtc = actRestEndTimeUtc;
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("minRest", isCheckBaseRest ? ruleParam._minRestAtBase : ruleParam._minRestAtLayover));
	rv->operation_result.insert(pair<string, string>("checkType", isCheckBaseRest ? "base" : "layover"));
	rv->operation_result.insert(pair<string, string>("actualRest", TimeUtils::MinutesTohhmm(actualRest)));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckMinRestBasedLocalNightForPRRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(MinRestBasedLocalNightForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(MinRestBasedLocalNightForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}