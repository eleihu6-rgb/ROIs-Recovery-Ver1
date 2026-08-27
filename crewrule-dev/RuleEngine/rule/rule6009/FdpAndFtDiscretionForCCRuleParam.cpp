/**
 * @file FdpAndFtDiscretionForCCRuleParam.h
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
#include "spdlog/spdlog.h"
#include "FdpAndFtDiscretionForCCRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"

using namespace std;

void FdpAndFtDiscretionForCCRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::MAXIMUM_DUTY_PERIOD):
				_maxDP = substr;
				_maxDPMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			case enum_to_underlying(ParamLocation::FLOWN_SEGMENT_RANGES): {
				_flownSegmentRanges = substr;
				vector<string> splitstrs;
				split(_flownSegmentRanges.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_flownSegmentLower = StringUtils::stoi(splitstrs[0].c_str(), 0);
					_flownSegmentUpper = StringUtils::stoi(splitstrs[1].c_str(), 0);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_ODP_BEFORE_DUTY):
				_minODPBeforeDuty = substr;
				_minODPBeforeDutyMinutes = (substr == RuleParamConstant::ALL) ? 0 : TimeUtils::hhmmToMinutes(substr);
				break;
			case enum_to_underlying(ParamLocation::FDP_MAX_EXTENSION):
				_fdpMaxExtension = substr;
				_fdpMaxExtensionMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			case enum_to_underlying(ParamLocation::FT_MAX_EXTENSION):
				_ftMaxExtension = substr;
				_ftMaxExtensionMinutes = TimeUtils::hhmmToMinutes(substr);
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

void FdpAndFtDiscretionForCCRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Maximum Duty Period,Flown Segment Ranges,Min ODP before Duty,FDP Max Extension,FT Max Extension
		if (header == "MAXIMUM DUTY PERIOD") {
			_maxDP = headeValue;
			_maxDPMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "FLOWN SEGMENT RANGES") {
			_flownSegmentRanges = headeValue;
			vector<string> splitstrs;
			split(_flownSegmentRanges.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_flownSegmentLower = StringUtils::stoi(splitstrs[0].c_str(), 0);
				_flownSegmentUpper = StringUtils::stoi(splitstrs[1].c_str(), 0);
			}
		}
		else if (header == "MIN ODP BEFORE DUTY") {
			_minODPBeforeDuty = headeValue;
			_minODPBeforeDutyMinutes = (headeValue == RuleParamConstant::ALL) ? 0 : TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "FDP MAX EXTENSION") {
			_fdpMaxExtension = headeValue;
			_fdpMaxExtensionMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "FT MAX EXTENSION") {
			_ftMaxExtension = headeValue;
			_ftMaxExtensionMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

//匹配MaxDP
bool FdpAndFtDiscretionForCCRuleParam::MatchMaxDP(const Duty& duty) const {
	if (this->_maxDP == RuleParamConstant::ALL) {
		return true;
	}
	if (duty.getDPInSecs() > this->_maxDPMinutes * 60) {
		return false;
	}
	return true;
}

//匹配FlownSegments
bool FdpAndFtDiscretionForCCRuleParam::MatchFlownSegments(const Duty& duty) const {
	if (this->_flownSegmentRanges == RuleParamConstant::ALL) {
		return true;
	}
	int flownSegNum = duty.getDutyFlownSegNum();
	if (flownSegNum >= this->_flownSegmentLower && flownSegNum < this->_flownSegmentUpper) {
		return true;
	}
	return false;
}

//匹配odpBeforeDuty
bool FdpAndFtDiscretionForCCRuleParam::MatchOdpBeforeDuty(const Duty* prevDuty, const Duty* currDuty) const {
	if (this->_minODPBeforeDuty == RuleParamConstant::ALL) {
		return true;
	}
	if (prevDuty == nullptr) {
		return true;
	}
	int odpBeforeDutyMinutes = static_cast<int>(currDuty->getStartTimeLocAct() - prevDuty->getEndTimeLocAct()) / 60;
	if (odpBeforeDutyMinutes > this->_minODPBeforeDutyMinutes) {
		return true;
	}
	return false;
}

//检查飞行执勤期FDP Extension是否满足
bool FdpAndFtDiscretionForCCRuleParam::CheckFDPExtension(const Duty& duty) const {
	int currFDPMinutes = duty.getFDPInSecs() / 60;
	int maxFDP = duty.getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);
	if (maxFDP < 0) {
		//没有MaxFDP限制
		return true;
	}
	if (duty.supportDiscretionType(DiscretionType::FDP)) {
		maxFDP += this->_fdpMaxExtensionMinutes;
	}
	if (currFDPMinutes > maxFDP) {
		return false;
	}
	return true;
}

//检查飞时FT Extension是否满足
bool FdpAndFtDiscretionForCCRuleParam::CheckFTExtension(const Duty& duty) const {
	int currFTMinutes = const_cast<Duty&>(duty).getBLKInMins();
	int maxFT = duty.getLimitationValue(RULE_LIMITATION_TYPE::MAX_BLOCK);
	if (maxFT < 0) {
		//没有MaxFT限制
		return true;
	}
	if (duty.supportDiscretionType(DiscretionType::FT)) {
		maxFT += this->_ftMaxExtensionMinutes;
	}
	if (currFTMinutes > maxFT) {
		return false;
	}
	return true;
}

//匹配规则参数是否满足
bool FdpAndFtDiscretionForCCRuleParam::MatchParam(const Duty* prevDuty, const Duty* currDuty) const {

	if (!MatchMaxDP(*currDuty)) {
		return false;
	}

	if (!MatchFlownSegments(*currDuty)) {
		return false;
	}

	if (!MatchOdpBeforeDuty(prevDuty, currDuty)) {
		return false;
	}

	return true;
}


//检查是否满足参数
int FdpAndFtDiscretionForCCRuleParam::CheckParam(const Duty& duty) const {
	int warnCode = (int)FdpAndFtDiscretionForCCRuleParam::WarnCode::NO_WARN;
	if (!CheckFDPExtension(duty)) {
		warnCode = (int)FdpAndFtDiscretionForCCRuleParam::WarnCode::FDP_EXTENSION_WARN;
	}
	if (!CheckFTExtension(duty)) {
		warnCode = warnCode | (int)FdpAndFtDiscretionForCCRuleParam::WarnCode::FT_EXTENSION_WARN;
	}
	return warnCode;
}