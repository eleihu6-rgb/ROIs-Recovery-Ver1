/**
 * @file CalculateFdpAndExtensionFor5JRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-02-20
**/

#include "../RuleSytem.h"
#include "CalculateFdpAndExtensionFor5JRule.h"
#include "../constant/Constants.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "Log/Logger.h"
#include "utils/CompetenceValidationUtils.h"
#include "utils/PhaseUtils.h"

void CalculateFdpAndExtensionFor5JRule::CalculateDuty(Duty* duty) {
	
	bool force = _dbData->scenario.airline == "TG" ? true : false; // TG场景特殊处理，强制覆盖原值

	for (const auto& ruleParam : _ruleParams) {
		if (_application == PAIRING_OPTIMIZER && (!RuleParams::GetInstancePtr()->canAugmented)) {
			if (ruleParam._isAugment)
				continue;
		}
		
		if (duty != nullptr && !PhaseUtils::IsChecked(duty, ruleParam.GetPhase(), this->_dbData)) {
			continue;
		}	

		if (ruleParam.MatchRuleParam(duty)) {
			int iMaxFDP = ruleParam._maxFDP + ruleParam._maxExtension;

			// 如果设置了duty asstributes，则覆盖之前的max FDP
			if (!ruleParam._dutyAttributesStr.empty() && ruleParam._dutyAttributesStr != "*") {
				if (!ruleParam._maxFDPStr.empty() && ruleParam._maxFDPStr != "*") {

					duty->clearLimitation(RULE_LIMITATION_TYPE::MAX_FDP);
					duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, iMaxFDP, ruleParam.RuleFuncId, ruleParam.GetRuleParamId(), ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference());
				}
				// max fdp为空， 新max fdp = 原max fdp + max Extension
				else {
					auto limit = duty->getLimiation(RULE_LIMITATION_TYPE::MAX_FDP);
					if (limit == nullptr) {
						duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, iMaxFDP, ruleParam.RuleFuncId, ruleParam.GetRuleParamId(), ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference(), force);
					}
					else {
						limit->value = limit->value + ruleParam._maxExtension;
						duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, limit->value, limit->last_set_rule, limit->ruleParamId, limit->overrideAbility, limit->classType, limit->description, limit->reference, force);
					}
				}
			}
			else {
				duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, iMaxFDP, ruleParam.RuleFuncId, ruleParam.GetRuleParamId(), ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference(), force);
			}
			duty->setFdpExtensionMinutes(ruleParam._maxExtension);
			
			return;
		}
	}
}



void CalculateFdpAndExtensionFor5JRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CalculateFdpAndExtensionFor5JRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
}