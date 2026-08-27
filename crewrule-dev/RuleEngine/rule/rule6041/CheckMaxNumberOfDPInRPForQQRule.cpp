/**
 * @file CheckMaxNumberOfDPInRPForQQRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckMaxNumberOfDPInRPForQQRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/DutyUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"

bool CheckMaxNumberOfDPInRPForQQRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;

	time_t checkedStartTime = 0, checkedEndTime = 0;
	time_t scenarioStart, scenarioEnd;
	int timezoneOffsetMinutes = 0;
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

	string defaultAirport = this->_dbData->systemParamMap["CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE"];
	if (defaultAirport != "") {
		timezoneOffsetMinutes = this->_dbData->getAirportOffsetMinutes(defaultAirport);
		scenarioStart = this->_dbData->scenario.startDtUTC + (time_t)(timezoneOffsetMinutes * 60);
		scenarioEnd = this->_dbData->scenario.endDtUTC + (time_t)(timezoneOffsetMinutes * 60);
	}

	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	const auto& duties = DutyUtils::GetDuties(rosters, this->_dbData);
	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);
		_ruleViolation.SetParam("crew_id", crew->idCrew);
		for (auto& rp : this->_dbData->rosterPeriodList) {
			if (rp.rp_start >= scenarioStart && rp.rp_end <= scenarioEnd) {
				if (!ruleParam.MatchCrewQualification(crew, rp.rp_start, rp.rp_end))
					continue;

				const auto& count = ruleParam.GetMatchDutyNumber(duties, rp.rp_start, rp.rp_end);

				if (count > ruleParam._maxLimitation) {
					if (this->_application == ROSTER_OPTIMIZER)
						return false;
					_ruleViolation.SetParam("count", to_string(count));
					_ruleViolation.SetParam("dpRanges", ruleParam._dpRanges);
					_ruleViolation.SetParam("maxLimitation", to_string(ruleParam._maxLimitation));
					_ruleViolation.SetParam("start", to_string(rp.rp_start - timezoneOffsetMinutes * 60));
					_ruleViolation.SetParam("end", to_string(rp.rp_end - timezoneOffsetMinutes * 60));
					ThrowRuleViolation();
				}
			}
		}
	}
	

	return passAllRule;
}

void CheckMaxNumberOfDPInRPForQQRule::ThrowRuleViolation() const {
	const auto& crew_id = this->_ruleViolation.GetParam("crew_id");
	const auto& count = this->_ruleViolation.GetParam("count");
	const auto& dpRanges = this->_ruleViolation.GetParam("dpRanges");
	const auto& maxLimitation = this->_ruleViolation.GetParam("maxLimitation");

	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("start"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("end"), 0);

	//航班(XXX)的人员岗位(XXX)数量小于最小要求
	std::string msg = "The number of duties ({0:count}) within the DP range ({1:dpRanges}) exceeds the limit ({2:maxLimitation}).";
	msg = StringUtils::Format(msg, count, dpRanges, maxLimitation);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = CheckMaxNumberOfDPInRPForQQRule::RuleFuncId;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->crewId = crew_id;
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->violation_msg = msg;

	_ruleViolation.AddRuleViolations(rv);
}


void CheckMaxNumberOfDPInRPForQQRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckMaxNumberOfDPInRPForQQRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

}