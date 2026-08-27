/**
 * @file AdaptionPeriodParam.h
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
#include "AdaptionPeriodParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"

using namespace std;

void AdaptionPeriodParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::TZ_DIFF): {
				_timezoneDiff = substr;

				vector<string> splitstrs;
				split(_timezoneDiff.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_timezoneDiffMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_timezoneDiffMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::DIRECTION):
				_direction = substr;
				break;
			case enum_to_underlying(ParamLocation::ADAPTION_PERIOD):
				_adaptionPeriod = substr;
				_adaptionPeriodMinutes = TimeUtils::hhmmToMinutes(_adaptionPeriod.c_str());
				break;
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void AdaptionPeriodParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		
		if (header == "TZ DIFF") {
			_timezoneDiff = headeValue;

			vector<string> splitstrs;
			split(_timezoneDiff.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_timezoneDiffMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_timezoneDiffMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "DIRECTION") {
			_direction = headeValue;
		}
		else if (header == "ADAPTION PERIOD") {
			_adaptionPeriod = headeValue;
			_adaptionPeriodMinutes = TimeUtils::hhmmToMinutes(_adaptionPeriod.c_str());
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}



//bool AdaptionPeriodParam::MatchParam(const std::string& composition, const long &reportTime, bool isAugment) const {
//
//    // The checking sequence can be reordered to better speed up the process
//    if (isAugment != _isAugment) return false;
//
//    if (_composition.front() != InputRuleParamDefine::WildcardChar && composition != _composition) return false;
//
//    if (reportTime < _reportTimeLower || reportTime > _reportTimeUpper) return false;
//
//    return true;
//}


