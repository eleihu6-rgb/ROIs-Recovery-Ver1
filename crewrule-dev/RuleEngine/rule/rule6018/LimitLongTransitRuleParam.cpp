/**
 * @file LimitLongTransitRuleParam.h
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
#include "LimitLongTransitRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/TimeUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"

using namespace std;

void LimitLongTransitRuleParam::ParseParam(const std::string &paramString) {
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
			case enum_to_underlying(ParamLocation::LONG_TRANSIT_AIRPORTS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _longTransitAirports);
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

void LimitLongTransitRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Pairing Bases,Long Transit Airports
		if (header == "PAIRING BASES") {
			_strPairingBases = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _pairingBases);
			}
		}
		else if (header == "LONG TRANSIT AIRPORTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _longTransitAirports);
			}
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

//判断是否满足所在基地条件
bool LimitLongTransitRuleParam::MatchPairingHomeBase(const Segment& segment, const std::string& base) const {
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

//检查是否可以进行中转的机场
bool LimitLongTransitRuleParam::CheckLongTransitAirports(const Segment& segment) const {
	if (_longTransitAirports.empty()) {
		return true;
	}
	const string& station = segment.getArrStation();
	return std::find(_longTransitAirports.cbegin(), _longTransitAirports.cend(), station) != _longTransitAirports.cend();
}

//匹配规则参数是否满足
bool LimitLongTransitRuleParam::MatchParam(const Segment& currSegment, const Segment& nextSegment, const std::string& base) const {
	Segment* seg1 = const_cast<Segment*>(&currSegment);
	Segment* seg2 = const_cast<Segment*>(&nextSegment);
	long_transit* longTransit = RuleParams::GetInstancePtr()->getLongTransit(seg1, seg2);
	if (longTransit == nullptr) {
		return false;
	}

	if (!MatchPairingHomeBase(currSegment, base)) {
		return false;
	}

	return true;
}


//检查是否满足参数
bool LimitLongTransitRuleParam::CheckParam(const Segment& segment) const {
	if (!CheckLongTransitAirports(segment)) {
		return false;
	}

	return true;
}