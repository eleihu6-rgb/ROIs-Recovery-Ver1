/**
 * @file FdpAndFtDiscretionForFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "spdlog/spdlog.h"
#include "FdpAndFtDiscretionForFdRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"
#include "../utils/CompositionRule.h"

using namespace std;

void FdpAndFtDiscretionForFdRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::ACC_STATE):
				_acclimatizationState = substr;
				break;
			case enum_to_underlying(ParamLocation::COMPOSITIONS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _compositions);
				}
				break;
			case enum_to_underlying(ParamLocation::IS_ONLY_LAST_DUTY):
				_isOnlyLastDuty = (substr == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(substr == RuleParamConstant::YES);
				break;
			case enum_to_underlying(ParamLocation::DUTY_TYPE):
				_dutyType = substr;
				split(substr, '|', _dutyTypeVec);
				break;
			case enum_to_underlying(ParamLocation::FDP_MAX_EXTENSION):
				_fdpMaxExtension = substr;
				_fdpMaxExtensionMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			case enum_to_underlying(ParamLocation::FT_MAX_EXTENSION):
				_ftMaxExtension = substr;
				_ftMaxExtensionMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			case enum_to_underlying(ParamLocation::DP_MAX_EXTENSION):
				_dpMaxExtension = substr;
				_dpMaxExtensionMinutes = TimeUtils::hhmmToMinutes(substr);
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

void FdpAndFtDiscretionForFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//ACC State,Compositions,Only Last Duty,FDP Max Extension,FT Max Extension
		if (header == "ACC STATE") {
			_acclimatizationState = headeValue;
		}
		else if (header == "COMPOSITIONS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _compositions);
			}
		}
		else if (header == "ONLY LAST DUTY") {
			_isOnlyLastDuty = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "DUTY TYPE" || header == "DUTY DIR") {
			_dutyType = headeValue;
			split(headeValue, '|', _dutyTypeVec);
		}
		else if (header == "FDP MAX EXTENSION") {
			_fdpMaxExtension = headeValue;
			_fdpMaxExtensionMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "FT MAX EXTENSION") {
			_ftMaxExtension = headeValue;
			_ftMaxExtensionMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "DP MAX EXTENSION") {
			_dpMaxExtension = headeValue;
			_dpMaxExtensionMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool FdpAndFtDiscretionForFdRuleParam::MatchComposition(const Duty& duty) const {
	if (_compositions.empty()) {
		return true;
	}
	bool isEditorModel = this->GetRule()->IsEditorModel();
	string compName = duty.getCompositionName();

	//Always recalcuate in editor application
	if (compName.empty() || isEditorModel)
		compName = CompositionRule::GetMinCompositionForRest(const_cast<Duty*>(&duty), this->GetRule()->GetDataContext());

	auto iter = std::find(_compositions.cbegin(), _compositions.cend(), compName);
	return iter != _compositions.cend();
}

bool FdpAndFtDiscretionForFdRuleParam::MatchAcclimatizationState(const Duty& duty) const {
	if (_acclimatizationState.empty() || _acclimatizationState == RuleParamConstant::ALL) {
		return true;
	}
	return duty.getAcclimatisedState() == _acclimatizationState;
}

bool FdpAndFtDiscretionForFdRuleParam::MatchOnlyLastDuty(const Duty& currDuty, const vector<Duty*>& duties) const {
	if (_isOnlyLastDuty == nullptr || duties.empty()) {
		return true;
	}
	Duty* lastDuty = duties[duties.size() - 1];
	bool isLastDuty = (lastDuty->getDutySeq() == currDuty.getDutySeq());
	return (isLastDuty == *_isOnlyLastDuty);
}

bool FdpAndFtDiscretionForFdRuleParam::MatchDytyType(const Duty& duty) const {
	if (_dutyType.empty() || _dutyType == RuleParamConstant::ALL) {
		return true;
	}
	return find(_dutyTypeVec.begin(), _dutyTypeVec.end(), duty.getDomIntType()) != _dutyTypeVec.end();
}

//检查飞行执勤期FDP Extension是否满足
bool FdpAndFtDiscretionForFdRuleParam::CheckFDPExtension(const Duty& currDuty, const vector<Duty*>& duties) const {
	int currFDPMinutes = currDuty.getFDPInSecs() / 60;
	int maxFDP = currDuty.getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);
	if (maxFDP < 0) {
		//没有MaxFDP限制
		return true;
	}
	if (currDuty.supportDiscretionType(DiscretionType::FDP)) {
		if (MatchOnlyLastDuty(currDuty, duties)) {
			maxFDP += this->_fdpMaxExtensionMinutes;
		}
	}
	if (currFDPMinutes > maxFDP) {
		return false;
	}
	return true;
}

//检查飞时FT Extension是否满足
bool FdpAndFtDiscretionForFdRuleParam::CheckFTExtension(const Duty& currDuty, const vector<Duty*>& duties) const {
	int currFTMinutes = const_cast<Duty&>(currDuty).getBLKInMins();
	int maxFT = currDuty.getLimitationValue(RULE_LIMITATION_TYPE::MAX_BLOCK);
	if (maxFT < 0) {
		//没有MaxFT限制
		return true;
	}
	if (MatchOnlyLastDuty(currDuty, duties) && currDuty.supportDiscretionType(DiscretionType::FT)) {
		maxFT += this->_ftMaxExtensionMinutes;
	}
	if (currFTMinutes > maxFT) {
		return false;
	}
	return true;
}


//检查DP Extension是否满足
bool FdpAndFtDiscretionForFdRuleParam::CheckDPExtension(const Duty& currDuty, const vector<Duty*>& duties) const {
	int currDPMinutes = const_cast<Duty&>(currDuty).getDPInSecs() / 60;
	int maxDP = currDuty.getLimitationValue(RULE_LIMITATION_TYPE::MAX_DP);
	if (maxDP < 0) {
		//没有MaxFT限制
		return true;
	}
	if (MatchOnlyLastDuty(currDuty, duties) && currDuty.supportDiscretionType(DiscretionType::DP)) {
		maxDP += this->_dpMaxExtensionMinutes;
	}
	if (currDPMinutes > maxDP) {
		return false;
	}
	return true;
}

//匹配规则参数是否满足
bool FdpAndFtDiscretionForFdRuleParam::MatchParam(const Duty& currDuty, const vector<Duty*>& duties) const {
	if (!MatchComposition(currDuty)) {
		return false;
	}

	if (!MatchAcclimatizationState(currDuty)) {
		return false;
	}

	if (!MatchDytyType(currDuty)) {
		return false;
	}

	return true;
}


//检查是否满足参数
int FdpAndFtDiscretionForFdRuleParam::CheckParam(const Duty& duty, const vector<Duty*>& duties) const {
	int warnCode = (int)WarnCode::NO_WARN;
	if (!CheckFDPExtension(duty, duties)) {
		warnCode = (int)WarnCode::FDP_EXTENSION_WARN;
	}
	if (!CheckFTExtension(duty, duties)) {
		warnCode = warnCode | (int)WarnCode::FT_EXTENSION_WARN;
	}
	if (!CheckDPExtension(duty, duties)) {
		warnCode = warnCode | (int)WarnCode::FT_EXTENSION_WARN;
	}
	return warnCode;
}