/**
 * @file LimitLayoverParam.h
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
#include "LimitLayoverParam.h"
#include "CrewDB.h"
#include "RuleParams.h"

#include "../utils/BaseUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/TimeUtils.h"
#include "../constant/Constants.h"

using namespace std;

void LimitLayoverParam::ParseParam(const std::string &paramString) {
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
			case enum_to_underlying(ParamLocation::LAYOVER_AIRPORTS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _layoverAirports);
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

void LimitLayoverParam::ParseParam(const DBRule& dbRule) {
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
		else if (header == "LAYOVER AIRPORTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _layoverAirports);
			}
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

//判断是否满足所在基地条件
bool LimitLayoverParam::MatchPairingHomeBase(const Duty& duty, const std::string& base) const {
	if (_pairingBases.empty()) {
		return true;
	}

    if (!base.empty()) {
        auto iter = std::find(_pairingBases.cbegin(), _pairingBases.cend(), base);
        return iter != _pairingBases.cend();
    } else {
        Pairing *pairing = this->GetRule()->GetDataContext()->pairingIdMap[duty.getPairingId()];
        if (pairing == nullptr) {
            spdlog::error("Pairing({}) do not exist.", duty.getPairingId());
            return true;
        }
        auto iter = std::find(_pairingBases.cbegin(), _pairingBases.cend(), pairing->getBase());
        return iter != _pairingBases.cend();
    }
}

//检查是否可以进行过夜的机场
bool LimitLayoverParam::CheckLayoverAirports(const Duty& duty) const {
	if (_layoverAirports.empty()) {
		return true;
	}
	const string& station = duty.getArrStation();
	return std::find(_layoverAirports.cbegin(), _layoverAirports.cend(), station) != _layoverAirports.cend();
}

bool LimitLayoverParam::MatchParam(const Duty& duty, const std::string& base) const {

	if (!MatchPairingHomeBase(duty, base)) {
		return false;
	}

	return true;
}

//检查是否满足参数
bool LimitLayoverParam::CheckParam(const Duty& duty) const {
	if (!CheckLayoverAirports(duty)) {
		return false;
	}
	return true;
}