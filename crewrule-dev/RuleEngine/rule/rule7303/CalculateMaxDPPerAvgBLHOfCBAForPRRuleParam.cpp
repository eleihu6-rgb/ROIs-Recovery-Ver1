/**
 * @file CalculateMaxDPPerAvgBLHOfCBAForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-11-27
**/


#include <sstream>
#include <map>
#include <climits>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CalculateMaxDPPerAvgBLHOfCBAForPRRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/CompositionRule.h"
#include "../utils/SegmentUtils.h"
#include "../constant/Constants.h"

#include "RuleParams.h"

using namespace std;

void CalculateMaxDPPerAvgBLHOfCBAForPRRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
			switch (i) {
				case enum_to_underlying(ParamLocation::BASES): {
					if (substr != RuleParamConstant::ALL) {
						split(substr, '|', _pairingBases);
					}
					break;
				}
				case enum_to_underlying(ParamLocation::FLEETS): {
					if (substr != RuleParamConstant::ALL) {
						split(substr, '|', _dutyFleets);
					}
					break;
				}
				case enum_to_underlying(ParamLocation::DUTY_TYPES): {
					if (substr != RuleParamConstant::ALL) {
						split(substr, '|', _dutyTypes);
					}
					break;
				}
				case enum_to_underlying(ParamLocation::AVG_BLH_RANGE): {
					_avgBLHRange = substr;

					vector<string> splitstrs;
					split(substr.c_str(), '-', splitstrs);
					if (splitstrs.size() >= 2) {
						_avgBLHRangeMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
						_avgBLHRangeMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
					}
					break;
				}
				case enum_to_underlying(ParamLocation::TOTAL_BLH_RANGE): {
					_totalBLHRange = substr;

					vector<string> splitstrs;
					split(substr.c_str(), '-', splitstrs);
					if (splitstrs.size() >= 2) {
						_totalBLHRangeMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
						_totalBLHRangeMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
					}
					break;
				}
				case enum_to_underlying(ParamLocation::MAX_DP): {
					_maxDP = TimeUtils::hhmmToMinutes(substr);
					break;
				}
				case enum_to_underlying(ParamLocation::SEVERITY): {
					this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
					break;
				}
				default: {
					Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
				}
			}
        }
    }
}

void CalculateMaxDPPerAvgBLHOfCBAForPRRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	//Bases,Fleets,Duty Types,Avg BLH Range,Total BLH Range,Max DP
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "BASES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _pairingBases);
			}
		}
		else if (header == "FLEETS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _dutyFleets);
			}
		}
		else if (header == "DUTY TYPES" || header == "DUTY DIR") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _dutyTypes);
			}
		}
		else if (header == "AVG BLH RANGE") {
			_avgBLHRange = headeValue;

			vector<string> splitstrs;
			split(headeValue.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_avgBLHRangeMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_avgBLHRangeMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "TOTAL BLH RANGE") {
			_totalBLHRange = headeValue;

			vector<string> splitstrs;
			split(headeValue.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_totalBLHRangeMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_totalBLHRangeMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "MAX DP") {
			_maxDP = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

//判断是否满足所在基地条件
bool CalculateMaxDPPerAvgBLHOfCBAForPRRuleParam::MatchPairingBase(const Duty& duty, const std::string& base) const {
	if (_pairingBases.empty()) {
		return true;
	}

	if (!base.empty()) {
		auto iter = std::find(_pairingBases.cbegin(), _pairingBases.cend(), base);
		return iter != _pairingBases.cend();
	}
	else {
		Pairing* pairing = this->GetRule()->GetDataContext()->pairingIdMap[duty.getPairingId()];
		if (pairing == nullptr) {
			spdlog::error("Pairing({}) do not exist.", duty.getPairingId());
			return true;
		}
		auto iter = std::find(_pairingBases.cbegin(), _pairingBases.cend(), pairing->getBase());
		return iter != _pairingBases.cend();
	}
}

bool CalculateMaxDPPerAvgBLHOfCBAForPRRuleParam::MatchDutyFleets(const Duty& duty) const {
	if (_dutyFleets.empty()) {
		return true;
	}

	bool matched = true;
	bool existFlySegment = false;//是否存在飞行航班。true-存在飞行航班，false-不存在飞行航班
	for (auto& segment : duty.getSegmentsRead()) {
		if (!segment->getIsOperating()) {
			continue;
		}
		existFlySegment = true;
		if (std::find(_dutyFleets.cbegin(), _dutyFleets.cend(), segment->getFleetCD()) == _dutyFleets.end()) {
			matched = false;
			break;
		}
	}
	return existFlySegment ? matched : false;
}

bool CalculateMaxDPPerAvgBLHOfCBAForPRRuleParam::MatchDutyTypes(const Duty& duty) const {
	if (duty.getSegmentsRead().empty() || _dutyTypes.empty()) {
		return true;
	}
	string domIntType = DutyUtils::getDutyType(&duty);
	auto iter = std::find(_dutyTypes.cbegin(), _dutyTypes.cend(), domIntType);
	return iter != _dutyTypes.cend();
}

//判断Duty平均飞时和总飞时是否满足
bool CalculateMaxDPPerAvgBLHOfCBAForPRRuleParam::MatchAvgAndTotalBLHRange(const Duty& duty) const {
	long totalBlh = 0;
	int flySegCount = 0;
	for (auto& segment : duty.getSegmentsRead()) {
		if (!segment->getIsOperating()) {
			continue;
		}
		flySegCount++;
		totalBlh += segment->getBlkMinutes();
	}
	long avgBlh = flySegCount == 0 ? 0 : (totalBlh / flySegCount);
	return (totalBlh >= _totalBLHRangeMinutesLower && totalBlh < _totalBLHRangeMinutesUpper)
		&& (avgBlh >= _avgBLHRangeMinutesLower && avgBlh < _avgBLHRangeMinutesUpper);
}

bool CalculateMaxDPPerAvgBLHOfCBAForPRRuleParam::MatchParam(const Duty& duty, const std::string& base) const {

	if (!MatchPairingBase(duty, base)) {
		return false;
	}

	if (!MatchDutyFleets(duty)) {
		return false;
	}

	if (!MatchDutyTypes(duty)) {
		return false;
	}

	if (!MatchAvgAndTotalBLHRange(duty)) {
		return false;
	}
	return true;
}

