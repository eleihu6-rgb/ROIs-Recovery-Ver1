/**
 * @file CumulativeFtLimitForEvaFdRuleParam.h
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
#include "CumulativeFtLimitForEvaFdRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"

using namespace std;

void CumulativeFtLimitForEvaFdRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::BASES):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _bases);
				}
				break;
			case enum_to_underlying(ParamLocation::RANKS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _ranks);
				}
				break;
			case enum_to_underlying(ParamLocation::FLEETS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _fleets);
				}
				break;
			case enum_to_underlying(ParamLocation::ASSIGNMENTS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _assignments);
				}
				break;
			case enum_to_underlying(ParamLocation::COMPOSITIONS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _compositions);
				}
				break;
			case enum_to_underlying(ParamLocation::PERIOD):
				_timePeriod = atoi(substr.c_str());
				break;
			case enum_to_underlying(ParamLocation::UNIT):
				_timePeriodUnit = substr;
				break;
			case enum_to_underlying(ParamLocation::MAX_BLH):
				_maxFT = substr;
				_maxFTMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			case enum_to_underlying(ParamLocation::SEVERITY):
				this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
				break;
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void CumulativeFtLimitForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Fleets,Assignments,Compositions,Period,Unit,Max BLH
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
		else if (header == "ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignments);
			}
		}
		else if (header == "COMPOSITIONS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _compositions);
			}
		}
		else if (header == "PERIOD") {
			_timePeriod = atoi(headeValue.c_str());
		}
		else if (header == "UNIT") {
			_timePeriodUnit = headeValue;
		}
		else if (header == "MAX BLH") {
			_maxFT = headeValue;
			_maxFTMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CumulativeFtLimitForEvaFdRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> teams;
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool CumulativeFtLimitForEvaFdRuleParam::MatchAssignments(const Duty& duty, const std::shared_ptr<CrewDataContext>& dbData) const {
	if (_assignments.empty()) {
		return true;
	}
	string assignment = duty.getAssignment();
	auto iter = std::find(_assignments.cbegin(), _assignments.cend(), assignment);
	return iter != _assignments.cend();
}

bool CumulativeFtLimitForEvaFdRuleParam::MatchComposition(const Duty& duty) const {
	if (_compositions.empty()) {
		return true;
	}
	bool isEditorModel = this->GetRule()->IsEditorModel();
	string compName = duty.getCompositionName();
	//Always recalcuate in editor application
	if (compName.empty() || isEditorModel) {
		compName = DutyUtils::GetCompositionByDutyFor3(&duty, this->GetRule()->GetDataContext());
		const_cast<Duty&>(duty).setCompositionName(compName);
	}

	auto iter = std::find(_compositions.cbegin(), _compositions.cend(), compName);
	return iter != _compositions.cend();
}




