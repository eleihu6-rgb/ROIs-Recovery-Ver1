/**
 * @file LimitAircraftChangeAndConnectionParam.h
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
#include "LimitAircraftChangeAndConnectionParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/TimeUtils.h"
#include "../constant/Constants.h"

using namespace std;

void LimitAircraftChangeAndConnectionParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::PAIRING_BASES):
				_strPairingBases = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _pairingBases);
				}
				break;
			case enum_to_underlying(ParamLocation::TRANSIT_AIRPORTS):
				_strTransitAirports = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _transitAirports);
				}
				break;
			case enum_to_underlying(ParamLocation::IS_AC_CHG):
				_strIsAcChg = substr;
				_isAcChg = (substr == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(substr == RuleParamConstant::YES);
				break;
			case enum_to_underlying(ParamLocation::MIN_CONNECTION):
				_minConnection = substr;
				_minConnectionMinutes = TimeUtils::hhmmToMinutes(_minConnection);
				break;
			case enum_to_underlying(ParamLocation::MAX_CONNECTION):
				_maxConnection = substr;
				_maxConnectionMinutes = TimeUtils::hhmmToMinutes(_maxConnection);
				break;
			case enum_to_underlying(ParamLocation::CHECK_GROUP):
				_strCheckGroups = substr;
				if (substr != RuleParamConstant::IGNORED_2) {
					split(strToUpper(substr), '|', _checkGroups);
				}
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

void LimitAircraftChangeAndConnectionParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Pairing Bases,Transit Airports,Layover Airports,AC Chg Allowed,Min Connection,Max Connection
		if (header == "PAIRING BASES") {
			_strPairingBases = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _pairingBases);
			}
		}
		else if (header == "TRANSIT AIRPORTS") {
			_strTransitAirports = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _transitAirports);
			}
		}
		else if (header == "IS AC CHG" || header == "AC CHG ALLOWED") { //deprecated "AC CHG ALLOWED" 2024/6/28
			_strIsAcChg = headeValue;
			_isAcChg = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "MIN CONNECTION") {
			_minConnection = headeValue;
			_minConnectionMinutes = TimeUtils::hhmmToMinutes(_minConnection);
		}
		else if (header == "MAX CONNECTION") {
			_maxConnection = headeValue;
			_maxConnectionMinutes = TimeUtils::hhmmToMinutes(_maxConnection);
		}
		else if (header == "CHECK GROUP(ANY)") {
			_strCheckGroups = headeValue;
			if (headeValue != RuleParamConstant::IGNORED_2) {
				split(strToUpper(headeValue), '|', _checkGroups);
			}
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

//判断是否满足所在基地条件
bool LimitAircraftChangeAndConnectionParam::MatchPairingHomeBase(const Segment& segment, const std::string& base) const {
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


//判断是否可以进行中转的机场
bool LimitAircraftChangeAndConnectionParam::MatchTransitAirports(const Segment& segment) const {
	if (_transitAirports.empty()) {
		return true;
	}
	const string& station = segment.getArrStation();
	return std::find(_transitAirports.cbegin(), _transitAirports.cend(), station) != _transitAirports.cend();
}

//判断长中转是否允许换飞机
bool LimitAircraftChangeAndConnectionParam::MatchAcChgAllowed(const Segment& currSegment, const Segment& nextSegment) const {
	if (_isAcChg == nullptr) {
		return true;
	}
	
	bool acChg = !((!currSegment.getRegister().empty() && !nextSegment.getRegister().empty() && (currSegment.getRegister() == nextSegment.getRegister()))
		|| currSegment.getNextLegNo() == nextSegment.getFlightNumber());
	return *(_isAcChg.get()) == acChg;
}

//判断连接时间是否满足
bool LimitAircraftChangeAndConnectionParam::CheckConnectionTime(const Segment& currSegment, const Segment& nextSegment) const {
	int transitDurationInSecs = SegmentUtils::GetTransitDurationInSecs(&currSegment, &nextSegment);
	this->GetRule()->getRuleViolation().SetParam("transitDuration", TimeUtils::MinutesTohhmm(transitDurationInSecs/60));
	return transitDurationInSecs >= _minConnectionMinutes * 60
		&& transitDurationInSecs < _maxConnectionMinutes * 60;
}


bool LimitAircraftChangeAndConnectionParam::MatchParam(const Segment& currSegment, const Segment& nextSegment, const std::string& base) const {

	if (!MatchPairingHomeBase(currSegment, base)) {
		return false;
	}

	if (!MatchTransitAirports(currSegment)) {
		return false;
	}

	if (!MatchAcChgAllowed(currSegment, nextSegment)) {
		return false;
	}
	return true;
}

//检查是否满足参数
LimitAircraftChangeAndConnectionParam::WarnCode LimitAircraftChangeAndConnectionParam::CheckParam(const Segment& currSegment, const Segment& nextSegment) const {

	if (!CheckConnectionTime(currSegment, nextSegment)) {
		return WarnCode::CONNECTION_WARN;
	}

	return WarnCode::NO_WARN;
}