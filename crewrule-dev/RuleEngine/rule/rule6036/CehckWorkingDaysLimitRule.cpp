#include "CehckWorkingDaysLimitRule.h"

#include "RuleParams.h"
#include "CehckWorkingDaysLimitRuleParam.h"
#include "utils/TimeUtils.h"
#include "utils/StringUtils.h"
#include "Utility.h"
#include "StringUtil.h"
#include "utils/RosterUtils.h"
#include "UtilFunc.h"
#include "../utils/StringUtils.h"


bool CehckWorkingDaysLimitRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (_ruleParams.empty() || rosters.empty()) {
		return true;
	}
	if (rosters.size() == 0)
		return true;
	
	const auto & crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	bool isValid = true;
	int minTimes;
	vector<string> bases;
	vector<string> ranks;
	vector<string> fleets;
	string excludingTeams;
	vector<string> dutyAssignments;
	time_t lCheckedStart = 0, lCheckedEnd = 0;
	time_t scenarioStart, scenarioEnd;
	int timezoneOffsetMinutes = 0;
	vector<string> positionsVec;
	split("*", '|', positionsVec);
	vector<string> teamsVec;
	split("*", '|', teamsVec);
	string defaultAirport = this->_dbData->systemParamMap["CLIENT_DEFAULT_MAIN_TIME_ZONE_BASE"];
	if (defaultAirport != "") {
		timezoneOffsetMinutes = this->_dbData->getAirportOffsetMinutes(defaultAirport);
		scenarioStart = this->_dbData->scenario.startDtUTC + (time_t)(timezoneOffsetMinutes * 60);
		scenarioEnd = this->_dbData->scenario.endDtUTC + (time_t)(timezoneOffsetMinutes * 60);
	}
	string base = Utility::GetInstancePtr()->getCrewPrimaryBase(crew->baseList, _dbData->scenario.startDtUTC);
	auto CrewBaseOffsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	time_t rollingWindow_start, rollingWindow_end;
	
	for (auto& rp : this->_dbData->rosterPeriodList) {
		if (rp.rp_start >= scenarioStart && rp.rp_end <= scenarioEnd) {
			rollingWindow_start = rp.rp_start;
			rollingWindow_end = rp.rp_end + 24 * 3600;

			_ruleViolation.SetParam("check_start", std::to_string(rp.rp_start - (time_t)(timezoneOffsetMinutes * 60)));
			_ruleViolation.SetParam("check_end", std::to_string(rp.rp_end - (time_t)(timezoneOffsetMinutes * 60)));
			std::vector<const ROSTER*> rostersInRange;
			for (std::size_t i = 0; i < rosters.size(); i++)
			{
				if (this->_application == ROSTER_OPTIMIZER && rosters[i]->source == "PA") {
					continue;
				}
				if ((const_cast<ROSTER*>(rosters[i])->getStartTimeUtcAct() >= rp.rp_start && const_cast<ROSTER*>(rosters[i])->getStartTimeUtcAct() < rp.rp_end)
					|| (const_cast<ROSTER*>(rosters[i])->getRestStartUtcAct() > rp.rp_start && const_cast<ROSTER*>(rosters[i])->getRestStartUtcAct() <= rp.rp_end))
					rostersInRange.push_back(rosters[i]);
			}
			if (rostersInRange.empty())
				continue;
			for (const auto & _ruleParam : _ruleParams) {
				minTimes = _ruleParam._minTimes;
				bases = _ruleParam._bases;
				ranks = _ruleParam._ranks;
				fleets = _ruleParam._fleets;
				excludingTeams = _ruleParam._excludingTeams;
				dutyAssignments = _ruleParam._dutyAssignments;
				if (!Utility::GetInstancePtr()->isCrewQualified(crew, bases, ranks, fleets, teamsVec, positionsVec, rollingWindow_start, rollingWindow_end))
					continue;
				if (Utility::GetInstancePtr()->isCrewTeamQualified(crew, excludingTeams, rollingWindow_start, rollingWindow_end))
					continue;
				_ruleViolation.SetRuleParam(_ruleParam);
				int dutyDays = RosterUtils::GetRosterDaysByAssignmentInRange(rostersInRange, dutyAssignments, rollingWindow_start, rollingWindow_end, CrewBaseOffsetMinutes);

				if (dutyDays < minTimes) {
					_ruleViolation.SetParam("min_times", std::to_string(minTimes));
					_ruleViolation.SetParam("duty_days", std::to_string(dutyDays));
					
					_ruleViolation.SetParam("duty_assignments", joinStrList(dutyAssignments, "|"));
					_ruleViolation.SetParam("check_start_str", utcToUtcString(rp.rp_start));
					_ruleViolation.SetParam("check_end_str", utcToUtcString(rp.rp_end));
					_ruleViolation.SetParam("duty_num", to_string(dutyDays));
					isValid = false;
					if (this->_application == ROSTER_OPTIMIZER) {
						return false;
					}
					ThrowRuleViolation();
				}
			}
		}
	}

	return isValid;
}


void CehckWorkingDaysLimitRule::ThrowRuleViolation() const {
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	//rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
	string msg = "The number of duties assigned ({0:duty_assignments}) is {1:duty_num}, which is less than the minimum required ({2:min_times}) in the period ({3:check_start_str}-{4:check_end_str}).";
	msg = StringUtils::Format(msg, _ruleViolation.GetParam("duty_assignments"),
		_ruleViolation.GetParam("duty_num"), _ruleViolation.GetParam("min_times"),
		_ruleViolation.GetParam("check_start_str"), _ruleViolation.GetParam("check_end_str"));

	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("check_start"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("check_end"), 0);
	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->crewId = ppCrew->idCrew;
	rv->violation_msg = msg;
	rv->description = _ruleParams[0].GetDescription();
	rv->idRule = _ruleParams[0].GetId();
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	//OP#1448提供message参数给gantt
	rv->operation_result.insert(pair<string, string>("strMinTimes", _ruleViolation.GetParam("min_times")));
	//rv->operation_result.insert(pair<string, string>("strStart", strStart));
	//rv->operation_result.insert(pair<string, string>("strEnd", strEnd));
	_ruleViolation.AddRuleViolations(rv);
}

void CehckWorkingDaysLimitRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CehckWorkingDaysLimitRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
}