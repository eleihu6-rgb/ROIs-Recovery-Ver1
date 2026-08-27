/**
 * @file CheckDisruptiveSchedulesLocalNightForTGRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckDisruptiveSchedulesLocalNightForTGRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/TrainingCourseUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "TimezoneUtils.h"
#include "index/TmCourseIndex.h"
#include "index/TmProgramIndex.h"
#include "Log/Logger.h"
#include "utils/CompetenceValidationUtils.h"
#include <algorithm>

bool CheckDisruptiveSchedulesLocalNightForTGRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}
	bool passAllRule = true;

	const auto& duties = DutyUtils::GetDuties(rosters, this->_dbData);

	if (duties.empty() || duties.size() == 1)
		return true;

	SharedPtr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string base = crew->getPrimeBase();

	for (const auto& _ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(_ruleParam);
		_ruleViolation.SetParam("crew_id", crew->idCrew);
		for (size_t i = 0; i < duties.size() - 1; i++) {
			const auto& currentDuty = duties[i];
			const auto& nextDuty = duties[i + 1];

			if (!_ruleParam.MatchAssignments(currentDuty->getAssignment(), nextDuty->getAssignment())) {
				continue;
			}

			if (!_ruleParam.MatchDutyATypes(currentDuty) || !_ruleParam.MatchDutyBTypes(nextDuty)) {
				continue;
			}

			if (!_ruleParam.MatchAHomeBase(currentDuty, base) || !_ruleParam.MatchBHomeBase(nextDuty, base))
				continue;

			int localNight = DutyUtils::GetLocalNightNums(currentDuty->getEndTimeLocAct(), nextDuty->getStartTimeLocAct(), 0);

			if (localNight < _ruleParam._minLocalNight) {
				if (this->_application == ROSTER_OPTIMIZER)
					return false;
				_ruleViolation.SetParam("start", utcToUtcString(currentDuty->getEndTimeUtcAct()));
				_ruleViolation.SetParam("end", utcToUtcString(nextDuty->getStartTimeUtcAct()));
				ThrowRuleViolation();
			}
		}
	}

	return passAllRule;

}

void CheckDisruptiveSchedulesLocalNightForTGRule::ThrowRuleViolation() const {
	const auto& crewId = _ruleViolation.GetParam("crew_id");
	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("start"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("end"), 0);
	string msgViolation = "The rest period need a local night.";
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
	rv->crewId = crewId;
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->violation_msg = msgViolation;
	_ruleViolation.AddRuleViolations(rv);
}


void CheckDisruptiveSchedulesLocalNightForTGRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckDisruptiveSchedulesLocalNightForTGRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

}
