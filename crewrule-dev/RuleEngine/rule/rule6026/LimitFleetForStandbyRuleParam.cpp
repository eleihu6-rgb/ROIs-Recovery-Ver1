/**
 * @file LimitFleetForStandbyRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <algorithm>
#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "LimitFleetForStandbyRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"

using namespace std;

void LimitFleetForStandbyRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
				case enum_to_underlying(ParamLocation::SEGMENT_ASSIGNMENT_GROUPS):
					if (substr != RuleParamConstant::ALL) {
						split(substr, '|', _segmentAssignmentGroups);
					}
					break;
				case enum_to_underlying(ParamLocation::SEGMENT_ASSIGNMENTS):
					if (substr != RuleParamConstant::ALL) {
						split(substr, '|', _segmentAssignments);
					}
					break;
				case enum_to_underlying(ParamLocation::SEGMENT_FLEET):
					_segmentFleet = substr;
					break;
				case enum_to_underlying(ParamLocation::REQUIRED_FLEETS): {
					_strRequiredFleets = substr;
					if (substr != RuleParamConstant::ALL) {
						if (substr.find("|") != string::npos) {
							_requiredFleetsOperator = "OR";
							split(substr, '|', _requiredFleets);
						}
						else {
							_requiredFleetsOperator = "AND";
							split(substr, '+', _requiredFleets);
						}
					}
					break;
				}
				case enum_to_underlying(ParamLocation::SEVERITY):
					this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
					break;
                default:
					Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void LimitFleetForStandbyRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Segment Assignment Groups,Segment Assignments,Fleet,Required Fleets
		if (header == "SEGMENT ASSIGNMENT GROUPS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _segmentAssignmentGroups);
			}
		}
		else if (header == "SEGMENT ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _segmentAssignments);
			}
		}
		else if (header == "FLEET") {
			_segmentFleet = headeValue;
		}
		else if (header == "REQUIRED FLEETS") {
			_strRequiredFleets = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				if (headeValue.find("|") != string::npos) {
					_requiredFleetsOperator = "OR";
					split(headeValue, '|', _requiredFleets);
				}
				else {
					_requiredFleetsOperator = "AND";
					split(headeValue, '+', _requiredFleets);
				}
				
			}
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}

}

bool LimitFleetForStandbyRuleParam::MatchSegmentAssignmentGroups(const Segment& segment) const {
	if (_segmentAssignmentGroups.empty()) {
		return true;
	}
	const std::shared_ptr<CrewDataContext>& dbData = this->GetRule()->GetDataContext();
	string assignment = segment.getAssignment();
	for (auto assigmentGroup : _segmentAssignmentGroups) {
		if (dbData->isAssignmentInGroup(assignment, assigmentGroup)) {
			return true;
		}
	}
	return false;
}

bool LimitFleetForStandbyRuleParam::MatchSegmentAssignments(const Segment& segment) const {
	if (_segmentAssignments.empty()) {
		return true;
	}
	string assignment = segment.getAssignment();
	auto iter = std::find(_segmentAssignments.cbegin(), _segmentAssignments.cend(), assignment);
	return iter != _segmentAssignments.cend();
}

bool LimitFleetForStandbyRuleParam::MatchSegmentFleet(const Segment& segment) const {
	return segment.getFleetCD() == this->_segmentFleet;
}

bool LimitFleetForStandbyRuleParam::MatchParam(const Segment& segment) const {

	if (!MatchSegmentAssignmentGroups(segment)) {
		return false;
	}

	if (!MatchSegmentAssignments(segment)) {
		return false;
	}

	if (!MatchSegmentFleet(segment)) {
		return false;
	}

	return true;
}

bool LimitFleetForStandbyRuleParam::CheckCrewFleets(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	if (_requiredFleetsOperator == "OR") {
		//_requiredFleetsOperator == "OR"
		//Crew在requiredFleets机型列表中任意一个机型，在[checkedStartTime,checkedEndTime]时间段内有效即可
		for (auto& _requiredFleet : _requiredFleets) {
			for (auto& fleet : crew->fleetList)
			{
				if (fleet->fleet == _requiredFleet
					&& ((fleet->effUtc <= checkedStartTime) && (fleet->expUtc < 0 || fleet->expUtc > checkedEndTime))) {
					return true;
				}
			}
		}
		return false;
	}
	else
	{
		//_requiredFleetsOperator == "AND"
		//requiredFleets列表中所有机型Crew必须在[checkedStartTime,checkedEndTime]时间段内有效
		for (auto& _requiredFleet : _requiredFleets) {
			bool matched = false;
			for (auto& fleet : crew->fleetList)
			{
				if (fleet->fleet == _requiredFleet
					&& ((fleet->effUtc <= checkedStartTime) && (fleet->expUtc < 0 || fleet->expUtc > checkedEndTime))) {
						matched = true;
						break;
				}
			}
			if (!matched) {
				return false;
			}
		}
		return true;
	}
	return true;
}
