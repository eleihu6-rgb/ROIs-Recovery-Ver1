/**
 * @file LimitBeforeAnnualLeaveRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitBeforeAnnualLeaveRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"

bool LimitBeforeAnnualLeaveRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;

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

	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.ClearParam();
		_ruleViolation.SetRuleParam(ruleParam);

		std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}

		bool pass = CheckRuleForCheckIn(rosters, ruleParam);
		if (!pass) {
			passAllRule = false;
		}
		pass = CheckRuleForCheckOut(rosters, ruleParam);
		if (!pass) {
			passAllRule = false;
		}
	}
	return passAllRule;
}

bool LimitBeforeAnnualLeaveRule::CheckRuleForCheckIn(const std::vector<const ROSTER*>& rosters, const LimitBeforeAnnualLeaveRuleParam& ruleParam) const {
	bool valid = true;
	const ROSTER* prevRoster = nullptr;
	int annualLeaveDays = 0; //当前Duty前累计年假天数
	time_t lastRosterEndBeforeFltRoster = 0;
	for (auto roster : rosters) {
		if (this->_application == ROSTER_OPTIMIZER && roster->source == "PA") {
			continue;
		}
		if (roster->pairing == nullptr) {
            if(ruleParam.MatchAssignment(roster->qualifier)){
				lastRosterEndBeforeFltRoster = roster->actEndLoc;
                if(!RosterUtils::IsConsecutiveLocalDay(prevRoster, roster))
                    annualLeaveDays = 1;
                else
                    annualLeaveDays++;
            }
			else {
				annualLeaveDays = 0;
			}

			prevRoster = roster;
		}
		else {
			auto duty = *(roster->pairing->getDutyVec().cbegin());
			if (duty->getFirstBreif() == nullptr) {
				continue;
			}
			time_t breifStartTimeLoc = duty->getFirstBreif()->getStartTimeLocAct();
			time_t breifStartTimeUtc = duty->getFirstBreif()->getStartTimeUtcAct();
			if (ruleParam.MatchMinPeriodDays(annualLeaveDays) && !ruleParam.MatchCheckInReferenceTime(breifStartTimeLoc, lastRosterEndBeforeFltRoster)) {
				valid = false;
				_ruleViolation.SetParam("breifStartTimeLoc", StringUtils::lltos((long long)breifStartTimeLoc));
				_ruleViolation.SetParam("breifStartTimeUtc", StringUtils::lltos((long long)breifStartTimeUtc));
				_ruleViolation.SetParam("referenceTime", ruleParam._checkInReferenceTime);

				ThrowRuleViolationForCheckIn(duty);
				break;
			}
			// roster->pairing != nullptr， 重置annualLeaveDays
			annualLeaveDays = 0;
			prevRoster = roster;
		}
	}
	return valid;
}

bool LimitBeforeAnnualLeaveRule::CheckRuleForCheckOut(const std::vector<const ROSTER*>& rosters, const LimitBeforeAnnualLeaveRuleParam& ruleParam) const {
	bool valid = true;
	const Duty* duty = nullptr;
	const ROSTER* prevNoFltRoster = nullptr;//前一个非航班的Roster（可能是地面任务或休息日或请休假）
	int annualLeaveDays = 0; //当前Duty后累计年假天数
	time_t firstRosterStartAfterFltRoster = 0;
	for (auto roster : rosters) {
		if (this->_application == ROSTER_OPTIMIZER && roster->source == "PA") {
			continue;
		}
		if (roster->pairing != nullptr) {
			duty = *(roster->pairing->getDutyVec().cend() - 1);
			annualLeaveDays = 0;
			prevNoFltRoster = nullptr;
		}
		else {
			if (RosterUtils::IsConsecutiveLocalDay(prevNoFltRoster, roster)
				&& ruleParam.MatchAssignment(roster->qualifier)) {
				if (annualLeaveDays == 0) {
					firstRosterStartAfterFltRoster = roster->actStrLoc;
				}
				annualLeaveDays++;
				
			}
			else {
				annualLeaveDays = 0;
			}
			if (duty != nullptr && duty->getLastDebrief() != nullptr) {
				time_t debreifEndTimeLoc = duty->getLastDebrief()->getEndTimeLocAct();
				time_t debreifEndTimeUtc = duty->getLastDebrief()->getEndTimeUtcAct();
				if (ruleParam.MatchMinPeriodDays(annualLeaveDays) && !ruleParam.MatchCheckOutReferenceTime(debreifEndTimeLoc, firstRosterStartAfterFltRoster)) {
					valid = false;
					_ruleViolation.SetParam("debreifEndTimeLoc", StringUtils::lltos((long long)debreifEndTimeLoc));
					_ruleViolation.SetParam("debreifEndTimeUtc", StringUtils::lltos((long long)debreifEndTimeUtc));
					_ruleViolation.SetParam("referenceTime", ruleParam._checkOutReferenceTime);
					ThrowRuleViolationForCheckOut(duty);
					break;
				}
			}
			prevNoFltRoster = roster;
		}
	}
	return valid;
}

void LimitBeforeAnnualLeaveRule::ThrowRuleViolationForCheckIn(const Duty* duty) const {
	time_t breifStartTimeLoc = StringUtils::stoi(_ruleViolation.GetParam("breifStartTimeLoc"), 0);
	time_t breifStartTimeUtc = StringUtils::stoi(_ruleViolation.GetParam("breifStartTimeUtc"), 0);
	string referenceTime = _ruleViolation.GetParam("referenceTime");

	string breifStartTimeLocStr = TimeUtils::Format(breifStartTimeLoc, "yyyy-mm-dd HH:mm");

	std::string msg = "The sign-on time of the FDP ({0:breifStartTimeLoc}) is prior to {1:referenceTime}.";
	msg = StringUtils::Format(msg, breifStartTimeLocStr.c_str(), referenceTime);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = LimitBeforeAnnualLeaveRule::RuleFuncId;
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySegNum();
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
		_ruleViolation.SetLegalityMessage(const_cast<Duty*>(duty), msg, LimitBeforeAnnualLeaveRule::RuleFuncId);
	}
	rv->startDTUtc = breifStartTimeUtc;
	rv->endDTUtc = breifStartTimeUtc;
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("ruleId", StringUtils::lltos(rv->idRule)));
	rv->operation_result.insert(pair<string, string>("breifStartTimeLoc", StringUtils::lltos((long long)breifStartTimeLoc)));
	rv->operation_result.insert(pair<string, string>("referenceTime", referenceTime));
	_ruleViolation.AddRuleViolations(rv);
}

void LimitBeforeAnnualLeaveRule::ThrowRuleViolationForCheckOut(const Duty* duty) const {
	time_t debreifEndTimeLoc = StringUtils::stoi(_ruleViolation.GetParam("debreifEndTimeLoc"), 0);
	time_t debreifEndTimeUtc = StringUtils::stoi(_ruleViolation.GetParam("debreifEndTimeUtc"), 0);
	string referenceTime = _ruleViolation.GetParam("referenceTime");

	string debreifEndTimeLocStr = TimeUtils::Format(debreifEndTimeLoc, "yyyy-mm-dd HH:mm");
	std::string msg = "The sign-off time of the FDP ({0:debreifEndTimeLoc}) is later than {1:referenceTime}.";
	msg = StringUtils::Format(msg, debreifEndTimeLocStr.c_str(), referenceTime);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = LimitBeforeAnnualLeaveRule::RuleFuncId;
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySegNum();
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
		_ruleViolation.SetLegalityMessage(const_cast<Duty*>(duty), msg, LimitBeforeAnnualLeaveRule::RuleFuncId);
	}
	rv->startDTUtc = debreifEndTimeUtc;
	rv->endDTUtc = debreifEndTimeUtc;
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("ruleId", StringUtils::lltos(rv->idRule)));
	rv->operation_result.insert(pair<string, string>("debreifEndTimeLoc", StringUtils::lltos((long long)debreifEndTimeLoc)));
	rv->operation_result.insert(pair<string, string>("referenceTime", referenceTime));
	_ruleViolation.AddRuleViolations(rv);
}

void LimitBeforeAnnualLeaveRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitBeforeAnnualLeaveRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitBeforeAnnualLeaveRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}