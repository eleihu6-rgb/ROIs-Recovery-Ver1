/**
 * @file RedEyeDefinitionForHXParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-01-14
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "RedEyeDefinitionForHXParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"

using namespace std;

void RedEyeDefinitionForHXParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::IS_BASE): {
				_isBase = (strToUpper(substr) == "Y");
				break;
			}
			case enum_to_underlying(ParamLocation::PICKUP_RANGE): {
				_pickupRange = substr;

				vector<string> splitstrs;
				split(substr.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_pickupLowerMinutes = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_pickupUpperMinutes = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::WOCL_START): {
				_woclStart = substr;
				_woclStartMinutes = TimeUtils::hhmmToMinutes(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::WOCL_END): {
				_woclEnd = substr;
				_woclEndMinutes = TimeUtils::hhmmToMinutes(substr.c_str());
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

void RedEyeDefinitionForHXParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//is Base(Y/N),PickUp Time Range,SCH FDP WOCL Start,SCH FDP WOCL End
		if (header == "IS BASE(Y/N)") {
			_isBase = (strToUpper(headeValue) == "Y");
		}
		else if (header == "PICKUP TIME RANGE" || header == "PICKUP RANGE") {
			_pickupRange = headeValue;

			vector<string> splitstrs;
			split(headeValue.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_pickupLowerMinutes = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_pickupUpperMinutes = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "SCH FDP WOCL START" || header == "WOCL START") {
			_woclStart = headeValue;
			_woclStartMinutes = TimeUtils::hhmmToMinutes(headeValue.c_str());
		}
		else if (header == "SCH FDP WOCL END" || header == "WOCL END") {
			_woclEnd = headeValue;
			_woclEndMinutes = TimeUtils::hhmmToMinutes(headeValue.c_str());
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

