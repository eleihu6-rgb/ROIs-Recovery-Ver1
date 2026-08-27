#include "CheckConsecutiveRosterForItRule.h"

#include "Utility.h"

#include <ctime>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
// #include "orlog.h"
#include <OrLog.h>
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "RuleParams.h"
#include "../utils/StringUtils.h"
#include "CheckConsecutiveRosterForItRuleParam.h"

#include <bitset>


//按crew检查
bool CheckConsecutiveRosterForItRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool isValid = true;
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
	const auto& crew = this->_dbData->crewIdMap.at(rosters[0]->idcrew);
	_ruleViolation.SetParam("crew_id", crew->idCrew);

	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime))
			continue;
		vector<string> assignments = ruleParam._assignments;
		vector<string> assignmentGroups = ruleParam._assignmentGroups;
		vector<string> attributes = ruleParam._attributes;
		int maxConsecutiveTime = ruleParam._maxConsecutiveTime;
		std::string consecutiveDefinition = ruleParam._consecutiveDefinition;
		_ruleViolation.SetParam("assignments", joinStrList(assignments, ","));
		_ruleViolation.SetParam("assignmentGroups", joinStrList(assignmentGroups, ","));
		_ruleViolation.SetParam("attributes", joinStrList(attributes, ","));
		_ruleViolation.SetParam("maxConsecutiveDuties", to_string(maxConsecutiveTime));

		int dutyTimes = 0;
		// 记录预占任务数量，如果全是预占，则跳过告警
		int preAssign = 0;
		for (std::size_t i = 0; i < rosters.size(); i++) {
			if (assignments.size() > 0 && assignments.at(0) != "*" && consecutiveDefinition.find("O") != string::npos && !ruleParam.MatchAssignment(rosters[i])) {
				dutyTimes = 0;
				preAssign = 0;
				continue;
			}
			if (assignmentGroups.size() > 0 && assignmentGroups.at(0) != "*" && consecutiveDefinition.find("O") != string::npos) {
				bool foundGroup = false;
				for (const auto& group : assignmentGroups) {
					if (this->_dbData->isAssignmentInGroup(rosters[i]->qualifier, group)) {
						
						foundGroup = true;
						break;
					}
				}
				if (!foundGroup) {
					dutyTimes = 0;
					preAssign = 0;
					continue;
				}
				
			}
			//标签校验
			if (attributes.size() > 0 && attributes.at(0) != "*") {
				bool foundAttr = false;
				if (rosters[i]->pairing) {
					std::vector<std::string> pairingAttributes;
					split(rosters[i]->pairing->getAttribute(), '|', pairingAttributes);
					if (pairingAttributes.size() > 0) {
						for (const auto& attr : pairingAttributes) {
							if (std::find(attributes.begin(), attributes.end(), attr) != attributes.end()) {
								foundAttr = true;
								break;
							}
						}
					}
				}
				else {
					std::vector<std::string> groundAttributes;
					split(rosters[i]->attribute, '|', groundAttributes);
					if (groundAttributes.size() > 0) {
						for (const auto& attr : groundAttributes) {
							if (std::find(attributes.begin(), attributes.end(), attr) != attributes.end()) {
								foundAttr = true;
								break;
							}
						}
					}
				}
				if (!foundAttr && consecutiveDefinition.find("O") != string::npos) {
					dutyTimes = 0;
					preAssign = 0;
					continue;
				}
			}
			++dutyTimes;
			if (rosters[i]->source == "PA")
				++preAssign;
			//if (dutyTimes > maxConsecutiveTime) {
			//	//如果全是预占，RO不告警
			//	if (this->_application == ROSTER_OPTIMIZER && dutyTimes == preAssign) {
			//		dutyTimes = 0;
			//		preAssign = 0;
			//		continue;
			//	}
			//	_ruleViolation.SetParam("dutyTimes", to_string(dutyTimes));
			//	ThrowRuleViolation();
			//	dutyTimes = 0;
			//	preAssign = 0;
			//	isValid = false;
			//	continue;
			//}
			// 如果两个roster之间相隔超过minRestDays * 24 * 3600, 则满足条件
			if (i != 0 && getBlankDaysBetweenRosters(rosters[i - 1], rosters[i]) > 0 && consecutiveDefinition.find("B") != string::npos) {
				dutyTimes = 1;
				preAssign = 1;
				continue;
			}
			if (dutyTimes > maxConsecutiveTime) {
				if (this->_application == ROSTER_OPTIMIZER && dutyTimes == preAssign) {
					dutyTimes = 0;
					preAssign = 0;
					continue;
				}
				if (this->_application == ROSTER_OPTIMIZER)
					return false;
				_ruleViolation.SetParam("start", to_string(rosters[i]->getStartTimeUtcAct()));
				_ruleViolation.SetParam("end", to_string(rosters[i]->getEndTimeUtcAct()));
				_ruleViolation.SetParam("rosterId", to_string(rosters[i]->rosterId));
				_ruleViolation.SetParam("dutyTimes", to_string(dutyTimes));
				_ruleViolation.SetParam("maxConsecutiveTime", to_string(maxConsecutiveTime));
				ThrowRuleViolation();
				dutyTimes = 0;
				preAssign = 0;
				isValid = false;
			}
		}

	}






	return isValid;
}

void CheckConsecutiveRosterForItRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckConsecutiveRosterForItRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
}

int CheckConsecutiveRosterForItRule::getBlankDaysBetweenRosters(const ROSTER* roster1, const ROSTER* roster2) const {
	int day1 = static_cast<int>(roster1->getRestStartLocAct() / (24 * 3600));
	int day2 = static_cast<int>(roster2->getStartTimeLocAct() / (24 * 3600));
	return day2 - day1 - 1;
}


void CheckConsecutiveRosterForItRule::ThrowRuleViolation() const {
	string errorMsg = "";
	if (!_ruleViolation.GetParam("assignmentGroups").empty()) {
		errorMsg += "AssignmentGroup(" + _ruleViolation.GetParam("assignmentGroups") + ") ";
	}
	if (!_ruleViolation.GetParam("assignments").empty()) {
		errorMsg += "Assignment (" + _ruleViolation.GetParam("assignments") + ") ";
	}
	if (!_ruleViolation.GetParam("attributes").empty()) {
		errorMsg += "Attributes(" + _ruleViolation.GetParam("attributes") + ") ";
	}

	if (!_ruleViolation.GetParam("dutyTimes").empty()) {
		errorMsg += "consecutive(" + _ruleViolation.GetParam("dutyTimes") + ") ";
	}
	if (!_ruleViolation.GetParam("maxConsecutiveTime").empty()) {
		errorMsg += "is exceed the max consecutive roster (" + _ruleViolation.GetParam("maxConsecutiveTime") + ").";
	}
	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("start"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("end"), 0);
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = _ruleViolation.GetParam("crew_id");
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->violation_msg = errorMsg;
	rv->rosterId = StringUtils::stoi(_ruleViolation.GetParam("rosterId"), 0);
	rv->idRule = _ruleParams[0].GetId();;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("maxConsecutiveDuties", _ruleViolation.GetParam("maxConsecutiveDuties")));
	_ruleViolation.AddRuleViolations(rv);
}