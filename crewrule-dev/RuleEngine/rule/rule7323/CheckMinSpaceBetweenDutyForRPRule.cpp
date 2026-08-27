/**
 * @file CheckMinSpaceBetweenDutyForRPRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckMinSpaceBetweenDutyForRPRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../constant/Constants.h"
#include "../utils/SegmentUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/TimeUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "TimezoneUtils.h"
#include "index/TmCourseIndex.h"
#include "index/TmProgramIndex.h"
#include "Log/Logger.h"
#include "utils/CompetenceValidationUtils.h"
#include <algorithm>
#include "../period/WorkPeriod.h"

bool CheckMinSpaceBetweenDutyForRPRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}
	bool passAllRule = true;

	const auto& crewId = rosters[0]->idcrew;
	std::vector<std::unique_ptr<WorkPeriod>> workPeriods = WorkPeriod::GetWorkPeriods(rosters, this->_dbData);
	const auto& crew = this->_dbData->crewIdMap[crewId];

	if (workPeriods.empty())
		return true;

	for (const auto& _ruleParam : _ruleParams) {
		if (_ruleParam.GetClassType() == RuleClassType::PO)
			continue;
		_ruleViolation.ClearParam();
		_ruleViolation.SetRuleParam(_ruleParam);
		_ruleViolation.SetParam("crew_id", crewId);
		_ruleViolation.SetParam("period", to_string(_ruleParam._minRestPeriod));
		_ruleViolation.SetParam("unit", _ruleParam._restUnit);
		
		for (size_t i = 0; i < workPeriods.size() - 1; i++) {
			auto& currentWorkPeriod = workPeriods.at(i);
			auto& nextWorkPeriod = workPeriods.at(i + 1);

			if (_ruleParam.GetClassType() == RuleClassType::RO) {
				const auto currentRoster = currentWorkPeriod->GetRoster();
				const auto nextRoster = nextWorkPeriod->GetRoster();
				if (currentRoster && nextRoster && currentRoster->pairId && nextRoster->pairId && currentRoster->pairId == nextRoster->pairId)
					continue;
			}

			if (!_ruleParam.MatchCrewQualification(crew, currentWorkPeriod->GetStartTimeUTC(), currentWorkPeriod->GetEndTimeUTC()))
				continue;

			if (_ruleParam.MatchRuleParam(currentWorkPeriod.get(), nextWorkPeriod.get())) {
				if (!_ruleParam.CheckMinRest(currentWorkPeriod->GetEndTimeLoc(), nextWorkPeriod->GetStartTimeLoc())) {
					if (this->_application == ROSTER_OPTIMIZER)
						return false;
					_ruleViolation.SetParam("start", to_string(currentWorkPeriod->GetEndTimeUTC()));
					_ruleViolation.SetParam("end", to_string(nextWorkPeriod->GetStartTimeUTC()));
					_ruleViolation.SetParam("start_loc", to_string(currentWorkPeriod->GetEndTimeLoc()));
					_ruleViolation.SetParam("end_loc", to_string(nextWorkPeriod->GetStartTimeLoc()));
					ThrowRuleViolation();
				}
			}
		}
	}

	return passAllRule;

}

bool CheckMinSpaceBetweenDutyForRPRule::CheckRule(const Pairing* pairing) const {
	if (pairing->getDutyVec().size() == 1)
		return true;
	bool valid = true;
	for (const auto& _ruleParam : _ruleParams) {
		if (_ruleParam.GetClassType() == RuleClassType::RO)
			continue;
		_ruleViolation.ClearParam();
		_ruleViolation.SetRuleParam(_ruleParam);
		_ruleViolation.SetParam("pairing_id", to_string(pairing->getDbId()));
		_ruleViolation.SetParam("period", to_string(_ruleParam._minRestPeriod));
		_ruleViolation.SetParam("unit", _ruleParam._restUnit);

		for (size_t i = 0; i < pairing->getDutyVec().size() - 1; i++) {
			auto& currentWorkPeriod = pairing->getDutyVec().at(i);
			auto& nextWorkPeriod = pairing->getDutyVec().at(i + 1);

			if (_ruleParam.MatchRuleParam(currentWorkPeriod, nextWorkPeriod)) {
				if (!_ruleParam.CheckMinRest(currentWorkPeriod->getEndTimeLocAct() + currentWorkPeriod->getMinDropoff() * 60, nextWorkPeriod->getStartTimeLocAct() - nextWorkPeriod->getMinPickup() * 60)) {
					valid = false;
					if (this->_application == ROSTER_OPTIMIZER)
						return false;
					_ruleViolation.SetParam("start", to_string(currentWorkPeriod->getEndTimeUtcAct()));
					_ruleViolation.SetParam("end", to_string(nextWorkPeriod->getStartTimeUtcAct()));
					_ruleViolation.SetParam("start_loc", to_string(currentWorkPeriod->getEndTimeLocAct() + currentWorkPeriod->getMinDropoff() * 60));
					_ruleViolation.SetParam("end_loc", to_string(nextWorkPeriod->getStartTimeLocAct() - nextWorkPeriod->getMinPickup() * 60));
					ThrowRuleViolation();
				}
			}
		}
	}
	return valid;
}

void CheckMinSpaceBetweenDutyForRPRule::ThrowRuleViolation() const {
	const auto& crewId = _ruleViolation.GetParam("crew_id");
	const auto& pairingId = _ruleViolation.GetParam("pairing_id");
	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("start"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("end"), 0);
	string startLoc = TimeUtils::Format(StringUtils::stoi(_ruleViolation.GetParam("start_loc"), 0));
	string endLoc = TimeUtils::Format(StringUtils::stoi(_ruleViolation.GetParam("end_loc"), 0));
	const auto& period = _ruleViolation.GetParam("period");
	const auto& unit = _ruleViolation.GetParam("unit");
	string msg = "The space between duty({0:startLoc} - {1:endLoc}) is less than the minumum rest time ({2:period} {3:unit}).";
	msg = StringUtils::Format(msg, startLoc, endLoc, period, unit);
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (crewId.empty()) {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
		rv->pairingId = stoll(pairingId);
	}
	else {
		rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
		rv->crewId = crewId;
	}
	
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->violation_msg = msg;
	_ruleViolation.AddRuleViolations(rv);
}


void CheckMinSpaceBetweenDutyForRPRule::ParseParam(const InputType& input) {
	//add by hexd ���DBRule֧��
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckMinSpaceBetweenDutyForRPRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

}
