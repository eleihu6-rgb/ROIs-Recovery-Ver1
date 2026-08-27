/**
 * @file CheckNightRestPeriodForEvaRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2024-08-19
**/

#include "../RuleSytem.h"
#include "CheckNightRestPeriodForEvaRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

bool CheckNightRestPeriodForEvaRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	if (rosters.empty()) {
		return true;
	}
	bool result = true;
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
	vector<Duty*> duties = DutyUtils::GetDuties(rosters, this->_dbData);
	for (const auto& ruleParam : _ruleParams) {
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime))
			continue;
		result = CheckRule(duties, ruleParam);
		if (this->_application == ROSTER_OPTIMIZER && !result) {
			return false;
		}
	}
	return result;
}

bool CheckNightRestPeriodForEvaRule::CheckRule(const Pairing* pairing) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	bool result = true;
	vector<Duty*> duties = pairing->getDutyVec();
	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);
		result = CheckRule(duties, ruleParam);
		if (this->_application == ROSTER_OPTIMIZER && !result) {
			return false;
		}
	}
	return result;
}

bool CheckNightRestPeriodForEvaRule::CheckRule(const std::vector<Duty*> duties, const CheckNightRestPeriodForEvaRuleParam ruleParam) const {
	bool result = true;
	if (duties.size() < 2)
		return true;
	for (std::size_t i = 1; i < duties.size(); i++) {
		Duty* currDuty = duties[i];
		int minRest = -1;//最新计算出minRest
			
		if (!ruleParam.MatchRule(currDuty))
			continue;

		time_t restStart = duties[i - 1]->getEndTimeLocAct();
		time_t restEnd = duties[i]->getStartTimeLocAct();
		if (!ruleParam.CheckMinRestBefore(restStart, restEnd) && !ruleParam.CheckSleepCycles(restStart, restEnd)) {
			result = false;
			if (this->_application == ROSTER_OPTIMIZER) {
				return false;
			}
			_ruleViolation.SetParam("sleep_cycle_num", to_string(ruleParam._minSleepCycles));
			_ruleViolation.SetParam("min_rest_before", TimeUtils::MinutesTohhmm(ruleParam._minRestBefore));
			_ruleViolation.SetParam("dutyId", to_string(duties[i]->getDutyId()));
			_ruleViolation.SetParam("start", to_string(duties[i]->getStartTimeUtcAct()));
			_ruleViolation.SetParam("end", to_string(duties[i]->getEndTimeUtcAct()));
			_ruleViolation.SetParam("pairing_id", to_string(duties[i]->getPairingId()));
			ThrowRuleViolation();
		}
	}
	return result;
}

void CheckNightRestPeriodForEvaRule::ThrowRuleViolation() const {
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	//rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
	string msg = "Duty id = " + _ruleViolation.GetParam("dutyId") + " does not have " + _ruleViolation.GetParam("sleep_cycle_num") + " consecutive sleep cycles or " 
		+ _ruleViolation.GetParam("min_rest_before") + " hours of uninterrupted rest period";
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		_ruleViolation.GetRuleLegality()->isLegal = false;
		rv->crewId = ppCrew->idCrew;
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}
	
	//_ruleViolation.SetLegalityMessage(ppCrew, msg);
	
	rv->startDTUtc = stol(_ruleViolation.GetParam("start"));
	rv->endDTUtc = stol(_ruleViolation.GetParam("end"));
	rv->pairingId = stol(_ruleViolation.GetParam("pairing_id"));
	rv->violation_msg = msg;
	rv->description = _ruleParams[0].GetDescription();
	rv->idRule = _ruleParams[0].GetId();
	
	_ruleViolation.AddRuleViolations(rv);
}

void CheckNightRestPeriodForEvaRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckNightRestPeriodForEvaRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
}