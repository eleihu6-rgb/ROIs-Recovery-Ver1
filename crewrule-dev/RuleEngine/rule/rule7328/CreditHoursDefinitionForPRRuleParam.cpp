/**
 * @file CreditHoursDefinitionForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-01-22
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CreditHoursDefinitionForPRRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/TrainingCourseUtils.h"
#include "../constant/Constants.h"
#include "index/TmProgramIndex.h"
#include "index/TmFootprintIndex.h"

using namespace std;

void CreditHoursDefinitionForPRRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::BASES): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _bases);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::RANKS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _ranks);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLEETS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _fleets);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::TEAMS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _teams);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ASSIGNMENTS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _assignments);
				}
				_assignmentMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::IS_POSITION): {
				_isPosition = (substr.empty() || substr == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(substr == RuleParamConstant::YES);
				break;
			}
			case enum_to_underlying(ParamLocation::TRAINING_ROLES): {
				_trainRoles = substr;
				_trainingRoleMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::PERCENTAGE): {
				_creditPercentage = StringUtils::stod(substr, 0) / 100.0;
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

void CreditHoursDefinitionForPRRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Fleets,Teams,Assignments,is Position(Y/N),Training Roles,Percentage(%)
		if (header == "BASES") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _bases);
			}
		}
		else if (header == "RANKS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _ranks);
			}
		}
		else if (header == "FLEETS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _fleets);
			}
		}
		else if (header == "TEAMS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _teams);
			}
		}
		else if (header == "ASSIGNMENTS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignments);
			}
			_assignmentMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "IS POSITION(Y/N)") {
			_isPosition = (headeValue.empty() || headeValue == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "TRAINING ROLES") {
			_trainRoles = headeValue;
			_trainingRoleMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "PERCENTAGE(%)") {
			_creditPercentage = StringUtils::stod(headeValue, 0) / 100.0;
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			spdlog::critical("Rule Param parsing error at rule:{0:>5}, cannot parse header:{}", 0 + RuleFuncId, header);
	}
}

//匹配参数
bool CreditHoursDefinitionForPRRuleParam::MatchParam(const Duty* duty, const Segment* segment) const {
	if (!_assignmentMatch.Match(*segment)) {
		return false;
	}

	return true;
}

//匹配参数
bool CreditHoursDefinitionForPRRuleParam::MatchParam(const ROSTER* roster, const Duty* duty, const Segment* segment, const size_t currSegIndex) const {

	std::vector<string> positions;
	if (!roster->isAllValid(_bases, _ranks, _fleets, _teams, positions)) {
		return false;
	}

	//飞行任务使用Segment.Assigment来匹配该参数，地面任务使用GroundRoster.Assignment来匹配该参数
	bool matched = (segment == nullptr) ? _assignmentMatch.Match(*roster) : _assignmentMatch.Match(*segment);
	if (!matched) {
		return false;
	}

	if (segment != nullptr && !MatchIsPosition(duty, segment, currSegIndex)) {
		return false;
	}

	vector<long long> flightIds;
	if (segment != nullptr) {
		flightIds.emplace_back(segment->getDBId());
	}

	if (!_trainingRoleMatch.Match(*roster, flightIds)) {
		return false;
	}

	return true;
}

bool CreditHoursDefinitionForPRRuleParam::MatchIsPosition(const Duty* duty, const Segment* segment, const size_t currSegIndex) const {
	if (this->_isPosition == nullptr || duty == nullptr || segment == nullptr) {
		return true;
	}

    //assignments参数没有配置DHD，则is Position参数不生效
    vector<string> dhdAssignments = { "DHD", "HSR", "TRAIN", "BUS" };
	if (this->_assignments.empty() || !StringUtils::Intersect(this->_assignments, dhdAssignments)) {
		return true;
	}
	
	auto& segments = duty->getSegmentsRead();
    if (segments.empty()) {
		return true;
	}

	if (*(this->_isPosition)) {
        for (size_t i = currSegIndex; i < segments.size(); ++i) {
			if (segments[i]->getAssignment() != "DHD" && segments[i]->getAssignment() != "HSR" 
				&& segments[i]->getAssignment() != "TRAIN" && segments[i]->getAssignment() != "BUS") {
				return false;
			}
		}
		return true;
	}
	else {
		if (segments[currSegIndex]->getAssignment() != "DHD" && segments[currSegIndex]->getAssignment() != "HSR"
			&& segments[currSegIndex]->getAssignment() != "TRAIN" && segments[currSegIndex]->getAssignment() != "BUS") {
			return false;
		}

		for (size_t i = currSegIndex + 1; i < segments.size(); ++i) {
			if (segments[i]->getAssignment() != "DHD" && segments[i]->getAssignment() != "HSR"
				&& segments[i]->getAssignment() != "TRAIN" && segments[i]->getAssignment() != "BUS") {
				return true;
			}
		}
		return false;
	}
	return false;
}