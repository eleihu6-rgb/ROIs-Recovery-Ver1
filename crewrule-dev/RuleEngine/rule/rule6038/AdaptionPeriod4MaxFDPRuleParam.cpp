/**
 * @file AdaptionPeriodRuleParam.h
 * @brief
 * @author aspen.sang
 * @email aspen.sang@pi-solution.com
 * @version 1.0
 * @date 2024-08-06
**/


#include <sstream>
#include <map>
#include <algorithm>
#include <iostream>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "AdaptionPeriod4MaxFDPRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/TimeUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"

using namespace std;

void AdaptionPeriod4MaxFDPRuleParam::ParseParam(const std::string& paramString) {
	std::stringstream ss(paramString);
	for (int i = 0; i < totalNumParam; ++i) {
		std::string substr;
		std::getline(ss, substr, delimInParam);
		if (!substr.empty()) {
			switch (i) {
			case enum_to_underlying(ParamLocation::MAX_CONSECUTIVE_DUTIES): {
				_maxConsecutiveDuties = strToInt(substr,8); // set a big default value just in case the incorrect value will impact the client running
				break;
			}
			case enum_to_underlying(ParamLocation::MAX_UNKNOW_STATES_OF_ACC): {
				_maxUnknownStatesOfACC = strToInt(substr, 3);// set a big default value just in case the incorrect value will impact the client running
				break;
			}			
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
			}
		}
	}
}

void AdaptionPeriod4MaxFDPRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Pairing Bases,Flight Airline,Flight Number,International/Domestic,Allow used as DHD(Y/N)
		if (header == "MAX CONSECUTIVE DUTIES") {
			_maxConsecutiveDuties = strToInt(headeValue, 8); // set a big default value just in case the incorrect value will impact the client running
		}
		else if (header == "MAX UNKNOWN STATES OF ACC") {
			_maxUnknownStatesOfACC = strToInt(headeValue, 3);// set a big default value just in case the incorrect value will impact the client running
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}
