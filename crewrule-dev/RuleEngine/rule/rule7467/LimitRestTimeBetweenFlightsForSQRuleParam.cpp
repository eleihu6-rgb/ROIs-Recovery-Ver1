/**
 * @file LimitRestTimeBetweenFlightsForSQRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-17
**/


#include <sstream>
#include <map>
#include <climits>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "LimitRestTimeBetweenFlightsForSQRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/SegmentUtils.h"
#include "../constant/Constants.h"

using namespace std;

void LimitRestTimeBetweenFlightsForSQRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::TYPE): {
				_type = strToUpper(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::FLIGHT_NO_A): {
				_flightNumberA = (substr == "0" || substr == RuleParamConstant::IGNORED) ? "" : substr;
				break;
			}
			case enum_to_underlying(ParamLocation::DEP_ARR_A): {
				_flightDepArrA = (substr == RuleParamConstant::IGNORED) ? "" : substr;
				break;
			}
			case enum_to_underlying(ParamLocation::FLIGHT_NO_B): {
				_flightNumberB = (substr == "0" || substr == RuleParamConstant::IGNORED) ? "" : substr;
				break;
			}
			case enum_to_underlying(ParamLocation::DEP_ARR_B): {
				_flightDepArrB = (substr == RuleParamConstant::IGNORED) ? "" : substr;
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_TIME_LIMIT): {
				_minTimeLimit = substr;
				_minTimeLimitMinutes = (substr.empty() || substr == "0" || substr == RuleParamConstant::IGNORED) ? INT_MIN : TimeUtils::hhmmToMinutes(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::MAX_TIME_LIMIT): {
				_maxTimeLimit = substr;
				_maxTimeLimitMinutes = (substr.empty() || substr == "0" || substr == RuleParamConstant::IGNORED) ? INT_MAX : TimeUtils::hhmmToMinutes(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::PENALTY): {
				_penalty = atoi(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::ACTIVE): {
				_active = (substr == RuleParamConstant::ALL) ? false : (substr == RuleParamConstant::YES);
				break;
			}
			case enum_to_underlying(ParamLocation::COMMENT): {
				_comment = substr;
				break;
			}
			case enum_to_underlying(ParamLocation::SEVERITY): {
				this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void LimitRestTimeBetweenFlightsForSQRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Type,Flight No A,Dep-Arr A,Flight No B,Dep-Arr B,Min Time Limit,Max Time Limit,Penalty,Active(Y/N),Comment
		if (header == "TYPE") {
			_type = strToUpper(headeValue);
		}
		else if (header == "FLIGHT NO A") {
			_flightNumberA = (headeValue == "0" || headeValue == RuleParamConstant::IGNORED) ? "" : headeValue;
		}
		else if (header == "DEP-ARR A") {
			_flightDepArrA = (headeValue == RuleParamConstant::IGNORED) ? "" : headeValue;
		}
		else if (header == "FLIGHT NO B") {
			_flightNumberB = (headeValue == "0" || headeValue == RuleParamConstant::IGNORED) ? "" : headeValue;
		}
		else if (header == "DEP-ARR B") {
			_flightDepArrB = (headeValue == RuleParamConstant::IGNORED) ? "" : headeValue;
		}
		else if (header == "MIN TIME LIMIT") {
			_minTimeLimit = headeValue;
			_minTimeLimitMinutes = (headeValue.empty() || headeValue == "0" || headeValue == RuleParamConstant::IGNORED) ? INT_MIN : TimeUtils::hhmmToMinutes(headeValue.c_str());
		}
		else if (header == "MAX TIME LIMIT") {
			_maxTimeLimit = headeValue;
			_maxTimeLimitMinutes = (headeValue.empty() || headeValue == "0" || headeValue == RuleParamConstant::IGNORED) ? INT_MAX : TimeUtils::hhmmToMinutes(headeValue.c_str());
		}
		        else if (header == "PENALTY") {
		            _penalty = atoi(headeValue.c_str());
		        }
		        else if (header == "ACTIVE") {
		            _active = (headeValue == RuleParamConstant::YES || headeValue == "Y");
		        }		else if (header == "ACTIVE(Y/N)") {
			_active = (headeValue.empty() || headeValue == RuleParamConstant::ALL) ? false : (headeValue == RuleParamConstant::YES);
		}
		else if (header == "COMMENT") {
			_comment = headeValue;
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

//匹配规则参数是否满足
bool LimitRestTimeBetweenFlightsForSQRuleParam::MatchParam(const Segment* currSegment, const Segment* nextSegment) const {
	if (!this->_flightNumberA.empty() && currSegment->getFlightNumber() != this->_flightNumberA) {
		return false;
	}

	string currFlightDepArr = currSegment->getDepStationRead() + "-" + currSegment->getArrStationRead();
	if (!this->_flightDepArrA.empty() && currFlightDepArr != this->_flightDepArrA) {
		return false;
	}

	if (this->_type == "CONN") {
		if (nextSegment != nullptr) {
			if (!this->_flightNumberB.empty() && nextSegment->getFlightNumber() != this->_flightNumberB) {
				return false;
			}

			string nextFlightDepArr = nextSegment->getDepStationRead() + "-" + nextSegment->getArrStationRead();
			if (!this->_flightDepArrB.empty() && nextFlightDepArr != this->_flightDepArrB) {
				return false;
			}
		}
	}

	return true;
}

