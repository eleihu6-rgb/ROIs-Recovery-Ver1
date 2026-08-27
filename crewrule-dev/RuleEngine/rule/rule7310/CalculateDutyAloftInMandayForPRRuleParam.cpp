/**
 * @file CalculateDutyAloftInMandayForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CalculateDutyAloftInMandayForPRRuleParam.h"
#include "CrewDB.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/CompositionRule.h"
#include "../constant/Constants.h"

using namespace std;

void CalculateDutyAloftInMandayForPRRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::BASES): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _bases);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::RANKS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _ranks);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLEETS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _fleets);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::TEAMS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _teams);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::DUTY_COMPOSITIONS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _dutyCompositions);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::DUTY_ASSIGNMENTS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _dutyAssignments);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLIGHT_COMPOSITIONS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _flightCompositions);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::SEGMENT_ASSIGNMENTS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _segmentAssignments);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::SEGMENT_FLEETS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _segmentFleets);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::SEGMENT_SUB_FLEETS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _segmentSubFleets);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::IN_FLIGHT_WAIT_TIME): {
				_inFlightWaitTime = substr;
				_inFlightWaitTimeMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::POST_ACTIVITY_TIME): {
				_postActivityTime = substr;
				_postActivityTimeMinutes = TimeUtils::hhmmToMinutes(substr);
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

void CalculateDutyAloftInMandayForPRRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Fleets,Teams,Duty Compositions,Duty Assignments,Flight Compositions,Segment Assignments,Segment Fleets,Segment Sub-Fleets,In-Flight Wait Time,Post-Activity Time
		if (header == "BASES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _bases);
			}
		}
		else if (header == "RANKS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _ranks);
			}
		}
		else if (header == "FLEETS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _fleets);
			}
		}
		else if (header == "TEAMS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _teams);
			}
		}
		else if (header == "DUTY COMPOSITIONS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _dutyCompositions);
			}
		}
		else if (header == "DUTY ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _dutyAssignments);
			}
		}
		else if (header == "FLIGHT COMPOSITIONS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _flightCompositions);
			}
		}
		else if (header == "SEGMENT ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _segmentAssignments);
			}
		}
		else if (header == "SEGMENT FLEETS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _segmentFleets);
			}
		}
		else if (header == "SEGMENT SUB-FLEETS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _segmentSubFleets);
			}
		}
		else if (header == "IN-FLIGHT WAIT TIME") {
			_inFlightWaitTime = headeValue;
			_inFlightWaitTimeMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "POST-ACTIVITY TIME") {
			_postActivityTime = headeValue;
			_postActivityTimeMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CalculateDutyAloftInMandayForPRRuleParam::MatchCrewQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const {
	std::vector<string> positions;
	if (!roster->isAllValid(_bases, _ranks, _fleets, _teams, positions)) {
		return false;
	}
	return true;
}

bool CalculateDutyAloftInMandayForPRRuleParam::MatchFlightCompositions(const Segment* segment) const {
	if (_flightCompositions.empty()) {
		return true;
	}
	string compName = CompositionRule::GetComposition(segment, this->GetRule()->GetDataContext());
	auto iter = std::find(_flightCompositions.cbegin(), _flightCompositions.cend(), compName);
	return iter != _flightCompositions.cend();
}

bool CalculateDutyAloftInMandayForPRRuleParam::MatchSegmentAssignment(const std::string& assignment) const {
	if (_segmentAssignments.empty()) {
		return true;
	}
	auto iter = std::find(_segmentAssignments.cbegin(), _segmentAssignments.cend(), assignment);
	return iter != _segmentAssignments.cend();
}

bool CalculateDutyAloftInMandayForPRRuleParam::MatchSegmentFleetAndSubFleet(const Segment* segment) const {
	if (!_segmentFleets.empty()) {
		auto iter = std::find(_segmentFleets.cbegin(), _segmentFleets.cend(), segment->getFleetCD());
		if (iter == _segmentFleets.cend()) {
			return false;
		}
	}

	if (!_segmentSubFleets.empty()) {
		auto iter = std::find(_segmentSubFleets.cbegin(), _segmentSubFleets.cend(), segment->getSubFleet());
		if (iter == _segmentSubFleets.cend()) {
			return false;
		}
	}

	return true;
}

bool CalculateDutyAloftInMandayForPRRuleParam::MatchDutyCompositions(const Duty* duty) const {
	if (_dutyCompositions.empty()) {
		return true;
	}
	bool isEditorModel = this->GetRule()->IsEditorModel();
	string compName = duty->getCompositionName();
	//Always recalcuate in editor application
	if (compName.empty() || isEditorModel) {
		compName = DutyUtils::GetCompositionByDutyFor3(duty, this->GetRule()->GetDataContext());
		const_cast<Duty*>(duty)->setCompositionName(compName);
	}

	auto iter = std::find(_dutyCompositions.cbegin(), _dutyCompositions.cend(), compName);
	return iter != _dutyCompositions.cend();
}

bool CalculateDutyAloftInMandayForPRRuleParam::MatchDutyAssignment(const std::string& assignment) const {
	if (_dutyAssignments.empty()) {
		return true;
	}
	auto iter = std::find(_dutyAssignments.cbegin(), _dutyAssignments.cend(), assignment);
	return iter != _dutyAssignments.cend();
}

//匹配参数
bool CalculateDutyAloftInMandayForPRRuleParam::MatchParam(const Duty* duty) const {
	if (!MatchDutyAssignment(duty->getAssignment())) {
		return false;
	}

	if (!MatchDutyCompositions(duty)) {
		return false;
	}

	return true;
}

//匹配参数
bool CalculateDutyAloftInMandayForPRRuleParam::MatchParam(const Segment* segment) const {
	if (!MatchSegmentAssignment(segment->getAssignment())) {
		return false;
	}

	if (!MatchSegmentFleetAndSubFleet(segment)) {
		return false;
	}

	//if (!MatchFlightCompositions(segment)) {
	//	return false;
	//}
	
	return true;
}
