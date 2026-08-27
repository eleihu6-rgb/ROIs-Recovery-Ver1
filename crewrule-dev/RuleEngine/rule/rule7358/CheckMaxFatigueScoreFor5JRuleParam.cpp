/**
 * @file CheckMaxFatigueScoreFor5JRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CheckMaxFatigueScoreFor5JRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/SegmentUtils.h"
#include "index/TmProgramIndex.h"
#include "index/TmFootprintIndex.h"
#include "../period/WorkPeriod.h"


using namespace std;

void CheckMaxFatigueScoreFor5JRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);
    map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
    string header, headeValue;
    for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
    {
        header = iter->first;
        headeValue = iter->second;
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
        else if (header == "MAX DUTY FATIGUE") {
            _maxDutyFatigue = headeValue;
            if (headeValue != RuleParamConstant::ALL) {
                _maxDutyFatigueValue = stod(headeValue);
            }
        }
        else if (header == "FATIGUE DISCRETION") {
			if (headeValue != RuleParamConstant::ALL && headeValue != "") {
				try {
					_fatigueDiscretion = stod(headeValue);
				}
				catch (const std::exception& e) {
					Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, FATIGUE DISCRETION is invalid number: {}", dbRule.idRule, dbRule.idRuleParam, headeValue);
				}
			}
		}
		else if (header == "FATIGUE DISCRETION ATTRIBUTES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _fatigueDiscretionAttributes);
			}
		}
        else
            Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
    }
}

bool CheckMaxFatigueScoreFor5JRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
    std::vector<string> positions;
    if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
        return true;
    return false;
}

double CheckMaxFatigueScoreFor5JRuleParam::GetDiscretion(const Duty* duty) const {
    if (MatchDutyAttributes(duty)) {
        return _fatigueDiscretion;
    }
    return 0.0;
}

bool CheckMaxFatigueScoreFor5JRuleParam::MatchDutyAttributes(const Duty* duty) const {

    if (_fatigueDiscretionAttributes.empty() || _fatigueDiscretionAttributes[0] == "*" || _fatigueDiscretionAttributes[0].empty())
        return true;

    if (duty->getAttributes().empty())
        return false;
    else {
        vector<string> attributes;
        split(duty->getAttributes(), '|', attributes);
        bool found = false;
        for (const auto& attr : _fatigueDiscretionAttributes) {
            if (find(attributes.begin(), attributes.end(), attr) != attributes.end()) {
                found = true;
                break;
            }
        }
        if (!found) {
            return false;
        }
    }
    return true;
}