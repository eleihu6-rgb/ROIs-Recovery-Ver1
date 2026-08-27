/**
 * @file CalculateDutyTimeForDelayedFlightRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <algorithm>
#include <map>
#include <cmath>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CalculateDutyTimeForDelayedFlightRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"

using namespace std;

void CalculateDutyTimeForDelayedFlightRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
            case enum_to_underlying(ParamLocation::IS_HOME_BASE):
                _isHomeBase = (substr == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(substr == RuleParamConstant::YES);
                break;
            case enum_to_underlying(ParamLocation::AMOUNT_OF_NOTIFICATION_RANGES): {
                _amountOfNotifyRanges = substr;
                vector<string> splitstrs{};
                split(_amountOfNotifyRanges.c_str(), '-', splitstrs);
                if (splitstrs.size() >= 2) {
                    _amountOfNotifyLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
                    _amountOfNotifyUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
                }
                break;
            }
            case enum_to_underlying(ParamLocation::AMOUNT_OF_DELAY_RANGES): {
                _amountOfDelayRanges = substr;
                vector<string> splitstrs{};
                split(_amountOfDelayRanges.c_str(), '-', splitstrs);
                if (splitstrs.size() >= 2) {
                    _amountOfDelayLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
                    _amountOfDelayUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
                }
                break;
            }
            case enum_to_underlying(ParamLocation::IS_USED_NEW_REPORTING_TIME):
                _isUsedNewReportingTime = (substr == RuleParamConstant::YES);
                break;
            case enum_to_underlying(ParamLocation::ORIGINAL_REPORTING_TIME_DELTA):
                _strOriginalReportingTimeDelta = substr;
                _originalReportingTimeDelta = TimeUtils::hhmmToMinutes(substr);
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

void CalculateDutyTimeForDelayedFlightRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Is Home Base,Amount of Notification Ranges,Is Used New Reporting Time,Original Reporting Time Delta
        if (header == "IS HOME BASE") {
            _isHomeBase = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(headeValue == RuleParamConstant::YES);
        }
        else if (header == "AMOUNT OF NOTIFICATION RANGES") {
            _amountOfNotifyRanges = headeValue;
            vector<string> splitstrs;
            split(_amountOfNotifyRanges.c_str(), '-', splitstrs);
            if (splitstrs.size() >= 2) {
                _amountOfNotifyLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
                _amountOfNotifyUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
            }
        }
        else if (header == "AMOUNT OF DELAY RANGES") {
            _amountOfDelayRanges = headeValue;
            vector<string> splitstrs;
            split(_amountOfDelayRanges.c_str(), '-', splitstrs);
            if (splitstrs.size() >= 2) {
                _amountOfDelayLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
                _amountOfDelayUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
            }
        }
        else if (header == "IS USED NEW REPORTING TIME") {
            _isUsedNewReportingTime = (headeValue == RuleParamConstant::YES);
        }
        else if (header == "ORIGINAL REPORTING TIME DELTA") {
            _strOriginalReportingTimeDelta = headeValue;
            _originalReportingTimeDelta = TimeUtils::hhmmToMinutes(headeValue);
        }
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

//判断是否在基地
bool CalculateDutyTimeForDelayedFlightRuleParam::MatchHomeBase(const Duty& duty, const std::string& base) const {
    std::string pairingBase;
    if (!base.empty()) {
        // if PO mode, extract the base string from pairing and passed to this predicate
        pairingBase = base;
    }
    else {
        // if editor mode, base is extracted from the segment's pairing
        Pairing* pairing = this->GetRule()->GetDataContext()->pairingIdMap[duty.getPairingId()];
        if (pairing == nullptr) {
            spdlog::error("Pairing({}) do not exist.", duty.getPairingId());
            return true;
        }
        pairingBase = pairing->getBase();
    }
    return _isHomeBase == nullptr || BaseUtils::IsHomeBaseByBase(duty.getDepStationRead(), vector<string>(), pairingBase) == *_isHomeBase;
}

//判断延误通知时间范围
bool CalculateDutyTimeForDelayedFlightRuleParam::MatchAmountOfNotifyRanges(const Duty& duty) const {
    Segment* segment = duty.getSegment(0);
    if (segment->getFltDelayNotifyUtc() <= 0) {
        //航班未发生延误
        return false;
    }

    if (this->_amountOfNotifyRanges.empty() || this->_amountOfNotifyRanges == RuleParamConstant::IGNORED) {
        return true;
    }

    //不考虑二次延误，均通过STD比较判断延误，屏蔽二次延误处理代码
    //if (segment->getFltLastDelayEtdUtc() > 0) {
    //    const std::shared_ptr<CrewDataContext>& dbData = this->GetRule()->GetDataContext();

    //    int fltDelayThresholdInSec = 30 * 60; //默认值30分钟
    //    if (dbData->systemParamMap.find("FLIGHT_DELAY_THRESHOLD") != dbData->systemParamMap.end()) {
    //        fltDelayThresholdInSec = StringUtils::stoi(dbData->systemParamMap["FLIGHT_DELAY_THRESHOLD"], 30) * 60;
    //    }
    //    int gap = std::abs(segment->getFltLastDelayEtdUtc() - segment->getEstDepDtUtc());
    //    //若gap=0，则flight的FltLastDelayEtdUtc、EstDepDtUtc相等说明发生延误
    //    if (gap != 0 && gap < fltDelayThresholdInSec) {
    //        //航班延误后，再次发生航班变动，但没有发生二次延误，则签到时间不变
    //        return false;
    //    }
    //}

    //签到时间需要适应brief节点中时间（因为duty.getStartTimeUtcAct()时间已经被firstSegment的实际时间修改了）
    time_t briefTime = (duty.getFirstBreif() == nullptr) ? duty.getStartTimeUtcAct() : duty.getFirstBreif()->getStartTimeUtcAct();
    int amountOfNotify = static_cast<int>(briefTime - segment->getFltDelayNotifyUtc());
    if (amountOfNotify >= this->_amountOfNotifyLower * 60 && amountOfNotify < this->_amountOfNotifyUpper * 60) {
        return true;
    }
	return false;
}

bool CalculateDutyTimeForDelayedFlightRuleParam::MatchAmountOfDelayRanges(const Duty& duty) const {
    if (this->_amountOfDelayRanges.empty() || this->_amountOfDelayRanges == RuleParamConstant::IGNORED) {
        return true;
    }
    Segment* segment = duty.getSegment(0);
    //if (segment->getFltDelayNotifyUtc() <= 0) {
    //    //航班未发生延误
    //    return false;
    //}

    Segment* firstSegemnt = duty.getFirstSegment();
    int delay = static_cast<int>(firstSegemnt->getStartTimeUtcAct() - firstSegemnt->getStartTimeUtcSch());

    if (delay >= this->_amountOfDelayLower * 60
        && delay < this->_amountOfDelayUpper * 60) {
        return true;
    }
    return false;
}


//匹配规则参数是否满足
bool CalculateDutyTimeForDelayedFlightRuleParam::MatchParam(const Duty& duty, const std::string& base) const {

	if (!MatchHomeBase(duty, base)) {
		return false;
	}

	if (!MatchAmountOfNotifyRanges(duty)) {
		return false;
	}

    if (!MatchAmountOfDelayRanges(duty)) {
        return false;
    }

    return true;
}
