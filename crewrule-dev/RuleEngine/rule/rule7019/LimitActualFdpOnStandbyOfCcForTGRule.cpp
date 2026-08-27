/**
 * @file LimitActualFdpOnStandbyOfCcForTGRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitActualFdpOnStandbyOfCcForTGRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"

bool LimitActualFdpOnStandbyOfCcForTGRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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

	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];

	std::map<const ROSTER*, const ROSTER*> rosterMap = RosterUtils::GetRosterMapForCalloutStandby(rosters, *RuleParams::GetInstancePtr()->getStandbyAssignments());
	for (auto& pair : rosterMap) {
		bool valid = CheckRule(pair.first, pair.second, crew);
		if (!valid) {
			passAllRule = false;
		}
	}

	return passAllRule;
}

bool LimitActualFdpOnStandbyOfCcForTGRule::CheckRule(const ROSTER* standbyRoster, const ROSTER* flyRoster, const std::shared_ptr<CREW>& crew) const {
	bool valid = true;
	string base = crew->getPrimeBase();
	Duty* duty = flyRoster->pairing->getFirstDuty();
	long callinSBY_FDPMins = flyRoster->callinSBY_FDPMins;

	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.ClearParam();
		_ruleViolation.SetRuleParam(ruleParam);
		if (ruleParam.MatchParam(standbyRoster, *duty, base)) {
			int combinedDuration = (int)callinSBY_FDPMins + duty->getActualFDP();
			if (combinedDuration >= ruleParam._maxCombinedDurationMinutes) {
				valid = false;
				_ruleViolation.SetParam("combinedDuration", TimeUtils::MinutesTohhmm(combinedDuration));
				ThrowRuleViolation(flyRoster, duty, ruleParam);
				if (!IsCheckAllRule()) {
					return valid;
				}
			}
		}

	}
	return valid;
}


void LimitActualFdpOnStandbyOfCcForTGRule::ThrowRuleViolation(const ROSTER* roster, const Duty* duty, const LimitActualFdpOnStandbyOfCcForTGRuleParam& ruleParam) const {
	string combinedDuration = _ruleViolation.GetParam("combinedDuration");

	std::string msg = "The combined duration of standby and assigned FDP ({0:combinedDuration}) exceeds the maximum limitation ({1:maxCombinedDuration}).";
	msg = StringUtils::Format(msg, combinedDuration, ruleParam._maxCombinedDuration);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = LimitActualFdpOnStandbyOfCcForTGRule::RuleFuncId;
	rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
	}
	else {
		_ruleViolation.SetLegalityMessage(const_cast<Pairing*>(roster->pairing), msg);
	}
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySeq();
	rv->startDTUtc = duty->getStartTimeUtcAct();
	rv->endDTUtc = duty->getEndTimeUtcAct();
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("combinedDuration", combinedDuration));
	rv->operation_result.insert(pair<string, string>("maxCombinedDuration", ruleParam._maxCombinedDuration));
	_ruleViolation.AddRuleViolations(rv);
}

void LimitActualFdpOnStandbyOfCcForTGRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitActualFdpOnStandbyOfCcForTGRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitActualFdpOnStandbyOfCcForTGRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}