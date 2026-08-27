/**
 * @file LimitFlightDHDRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "LimitFlightDHDRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/TimeUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"

using namespace std;

void LimitFlightDHDRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::PAIRING_BASES): {
				_strPairingBases = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _pairingBases);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLIGHT_AIRLINE): {
				_strFlightAirlines = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _flightAirlines);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLIGHT_NUMBER): {
				_strFlightNumbers = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _flightNumbers);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::INTERNATIONAL_DOMESTIC): {
				_strDomIntTypes = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _domIntTypes);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ALLOW_USED_AS_DHD): {
				_isAllowUsedDHD = (strToUpper(substr) == "Y");
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

void LimitFlightDHDRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Pairing Bases,Flight Airline,Flight Number,International/Domestic,Allow used as DHD(Y/N)
		if (header == "PAIRING BASES") {
			_strPairingBases = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _pairingBases);
			}
		}
		else if (header == "FLIGHT AIRLINE") {
			_strFlightAirlines = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _flightAirlines);
			}
		}
		else if (header == "FLIGHT NUMBER") {
			_strFlightNumbers = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _flightNumbers);
			}
		}
		else if (header == "INTERNATIONAL/DOMESTIC") {
			_strDomIntTypes = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _domIntTypes);
			}
		}
		else if (header == "ALLOW USED AS DHD(Y/N)") {
			_isAllowUsedDHD = (strToUpper(headeValue) == "Y");
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

//判断是否满足所在基地条件
bool LimitFlightDHDRuleParam::MatchPairingHomeBase(const Segment& segment, const std::string& base) const {
	if (_pairingBases.empty()) {
		return true;
	}

	if (!base.empty()) { 
		// if PO mode, extract the base string from pairing and passed to this predicate
		auto iter = std::find(_pairingBases.cbegin(), _pairingBases.cend(), base);
		return iter != _pairingBases.cend();
	}
	// if editor mode, base is extracted from the segment's pairing
	Pairing *pairing = this->GetRule()->GetDataContext()->pairingIdMap[segment.getPairingId()];
	if (pairing == nullptr) {
		spdlog::error("Pairing({}) do not exist.", segment.getPairingId());
		return true;
	}
	auto iter = std::find(_pairingBases.cbegin(), _pairingBases.cend(), pairing->getBase());
	return iter != _pairingBases.cend();
}

//判断是否满足航班航司条件
bool LimitFlightDHDRuleParam::MatchFlightAirlines(const Segment& segment) const {
	if (_flightAirlines.empty()) {
		return true;
	}
	string airline = segment.getAirline();
	auto iter = std::find(_flightAirlines.cbegin(), _flightAirlines.cend(), airline);
	return iter != _flightAirlines.cend();
}

//判断是否满足航班号条件
bool LimitFlightDHDRuleParam::MatchFlightNumbers(const Segment& segment) const {
	if (_flightNumbers.empty()) {
		return true;
	}
	string flightNumber = segment.getFlightNumber();
	auto iter = std::find(_flightNumbers.cbegin(), _flightNumbers.cend(), flightNumber);
	return iter != _flightNumbers.cend();

}

//判断是否满足航班的国内和国际类型
bool LimitFlightDHDRuleParam::MatchFlightDomIntType(const Segment& segment) const {
	if (_domIntTypes.empty()) {
		return true;
	}
	string domIntType = segment.getDomIntType();
	auto iter = std::find(_domIntTypes.cbegin(), _domIntTypes.cend(), domIntType);
	return iter != _domIntTypes.cend();

}

//检查不允许航班置位DHD
bool LimitFlightDHDRuleParam::CheckNotAllowedDHD(const Segment& segment) const {
	if (_isAllowUsedDHD) {
		//_isAllowUsedDHD为true，表示航班允许为置位DHD（即可以为置位DHD，也可以不是置位DHD）。因此直接返回true
		return true;
	}
	return segment.isDeadhead() == _isAllowUsedDHD;
}

//匹配规则参数是否满足
bool LimitFlightDHDRuleParam::MatchParam(const Segment& segment, const std::string& base) const {

	if (!MatchPairingHomeBase(segment, base)) {
		return false;
	}

	if (!MatchFlightAirlines(segment)) {
		return false;
	}

	if (!MatchFlightNumbers(segment)) {
		return false;
	}

	if (!MatchFlightDomIntType(segment)) {
		return false;
	}
	return true;
}



//检查是否满足参数
int LimitFlightDHDRuleParam::CheckParam(const Segment& segment) const {
	int warnCode = (int)WarnCode::NO_WARN;
	if (!CheckNotAllowedDHD(segment)) {
		warnCode = (int)WarnCode::NOT_ALLOWED_DHD;
	}
	return warnCode;
}