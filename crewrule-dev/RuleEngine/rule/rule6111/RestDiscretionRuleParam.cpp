/**
 * @file RestDiscretionRuleParam.h
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
#include "RestDiscretionRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"
#include "../utils/CompositionRule.h"

using namespace std;

void RestDiscretionRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::IS_HOME_BASE):
				_isHomeBase = (substr == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(substr == RuleParamConstant::YES);
				break;
			case enum_to_underlying(ParamLocation::ACC_STATE):
				_acclimatizationState = substr;
				break;
			case enum_to_underlying(ParamLocation::COMPOSITIONS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _compositions);
				}
				break;
			case enum_to_underlying(ParamLocation::MIN_ODP_RANGES): {
				_minRestRanges = substr;

				vector<string> splitstrs;
				split(_minRestRanges.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_minRestMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_minRestMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::REST_MAX_REDUCTION):
				_restMaxReduction = substr;
				_restMaxReductionMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			case enum_to_underlying(ParamLocation::REDUCTION_TYPE):
				_reductionType = strToUpper(substr);
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

void RestDiscretionRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//is Home Base,ACC State,Compositions,Min ODP Ranges,Reduction Type,Rest Max Reduction
		if (header == "IS HOME BASE") {
			_isHomeBase = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "ACC STATE") {
			_acclimatizationState = headeValue;
		}
		else if (header == "COMPOSITIONS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _compositions);
			}
		}
		else if (header == "MIN ODP RANGES") {
			_minRestRanges = headeValue;

			vector<string> splitstrs;
			split(_minRestRanges.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_minRestMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_minRestMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "REDUCTION TYPE") {
			_reductionType = strToUpper(headeValue);
		}
		else if (header == "REST MAX REDUCTION") {
			_restMaxReduction = headeValue;
			_restMaxReductionMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

//判断是否在基地
bool RestDiscretionRuleParam::MatchHomeBase(const Duty& duty, const std::string& base) const {
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
	return _isHomeBase == nullptr || BaseUtils::IsHomeBaseByBase(duty.getArrStationRead(), vector<string>(), pairingBase) == *_isHomeBase;
}

bool RestDiscretionRuleParam::MatchComposition(const Duty& duty) const {
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

bool RestDiscretionRuleParam::MatchAcclimatizationState(const Duty* nextDuty) const {
	if (_acclimatizationState.empty() || _acclimatizationState == RuleParamConstant::ALL) {
		return true;
	}
	if (nextDuty == nullptr) {
		//Min ODP判断适应状态，实际是判断nextDuty的适应状态，若nextDuty为null，则认为适应状态为“适应(A)”
		return (AcclimatizationState::ACCLIMATIZED == _acclimatizationState);
	}
	return nextDuty->getAcclimatisedState() == _acclimatizationState;
}

//匹配MinRest
bool RestDiscretionRuleParam::MatchMinRestRanges(const Duty& duty) const {
	if (this->_minRestRanges == RuleParamConstant::ALL) {
		return true;
	}
	int minRestMinutes = duty.getMinRest();
	if (minRestMinutes >= this->_minRestMinutesLower && minRestMinutes < this->_minRestMinutesUpper) {
		return true;
	}
	return false;
}

//检查Rest Reduction是否满足
bool RestDiscretionRuleParam::CheckRestReduction(const Duty* currDuty, const Duty* nextDuty) const {
	int actualRest = currDuty->getActualRest();
	int minRest = currDuty->getLimitationValue(RULE_LIMITATION_TYPE::MIN_REST);
	if (minRest < 0) {
		//没有MinRest限制
		return true;
	}
	if (currDuty->supportDiscretionType(DiscretionType::REST)) {
		minRest -= this->_restMaxReductionMinutes;
	}
	if (actualRest < minRest) {
		return false;
	}
	return true;
}


//匹配规则参数是否满足
bool RestDiscretionRuleParam::MatchParam(const Duty* currDuty, const Duty* nextDuty, const std::string& base) const {
	if (!MatchHomeBase(*currDuty, base)) {
		return false;
	}

	if (!MatchComposition(*currDuty)) {
		return false;
	}

	if (!MatchAcclimatizationState(nextDuty)) {
		return false;
	}

	if (!MatchMinRestRanges(*currDuty)) {
		return false;
	}
	return true;
}


//检查是否满足参数
RestDiscretionRuleParam::WarnCode RestDiscretionRuleParam::CheckParam(const Duty* currDuty, const Duty* nextDuty) const {
	if (!CheckRestReduction(currDuty, nextDuty)) {
		return RestDiscretionRuleParam::WarnCode::REST_REDUCTION_WARN;
	}

	return RestDiscretionRuleParam::WarnCode::NO_WARN;
}