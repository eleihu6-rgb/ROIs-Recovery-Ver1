/**
 * @file LimitAircraftChangeRuleParam.h
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
#include "LimitAircraftChangeRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/TimeUtils.h"
#include "../constant/Constants.h"

using namespace std;

void LimitAircraftChangeRuleParam::ParseParam(const std::string &paramString) {
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
			case enum_to_underlying(ParamLocation::AC_CHG_ALLOWED):
				_strAcChgAllowed = substr;
				_acChgAllowed = (substr == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(substr == RuleParamConstant::YES);
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

void LimitAircraftChangeRuleParam::ParseParam(const DBRule& dbRule) {
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
		else if (header == "AC CHG ALLOWED") {
			_strAcChgAllowed = headeValue;
			_acChgAllowed = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

//判断是否满足所在基地条件
bool LimitAircraftChangeRuleParam::MatchPairingHomeBase(const Segment& segment, const std::string& base) const {
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
bool LimitAircraftChangeRuleParam::MatchTransitAirports(const Segment& segment) const {
	if (_transitAirports.empty()) {
		return true;
	}
	const string& station = segment.getArrStation();
	return std::find(_transitAirports.cbegin(), _transitAirports.cend(), station) != _transitAirports.cend();
}

//判断长中转是否允许换飞机
bool LimitAircraftChangeRuleParam::CheckAcChgAllowed(const Segment& currSegment, const Segment& nextSegment) const {
	if (_acChgAllowed == nullptr) {
		return true;
	}
    bool acChg = true;
    if (currSegment.getTailNum().empty() || nextSegment.getTailNum().empty()) {
        acChg = currSegment.getNextLegNo() != nextSegment.getFlightNumber();
    } else {
        acChg = currSegment.getTailNum() != nextSegment.getTailNum();
    }

	return *(_acChgAllowed.get()) || *(_acChgAllowed.get()) == acChg;
}

bool LimitAircraftChangeRuleParam::MatchParam(const Segment& currSegment, const Segment& nextSegment, const std::string& base) const {

	if (!MatchPairingHomeBase(currSegment, base)) {
		return false;
	}

	if (!MatchTransitAirports(currSegment)) {
		return false;
	}
	return true;
}

//检查是否满足参数
LimitAircraftChangeRuleParam::WarnCode LimitAircraftChangeRuleParam::CheckParam(const Segment& currSegment, const Segment& nextSegment) const {

	if (!CheckAcChgAllowed(currSegment, nextSegment)) {
		return WarnCode::AC_CHG_WARN;
	}

	return WarnCode::NO_WARN;
}