/**
 * @file CalculateFdpExtensionWithInFlightRestOfCcForTGRule.cpp
 * @brief 7029法规规则类实现
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-06-09
**/

#include <algorithm>
#include <cfloat>
#include "CalculateFdpExtensionWithInFlightRestOfCcForTGRule.h"
#include "../RuleSytem.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "TimezoneUtils.h"
#include "Log/Logger.h"

void CalculateFdpExtensionWithInFlightRestOfCcForTGRule::CalculateDuty(Duty* duty) {
	if (_ruleParam->Empty() || duty == nullptr) {
		return;
	}
	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	CalculateDuty(duties);
}

void CalculateFdpExtensionWithInFlightRestOfCcForTGRule::CalculateDuty(Pairing* pairing) {
	if (_ruleParam->Empty() || pairing == nullptr) {
		return;
	}
	vector<Duty*>& duties = const_cast<vector<Duty*>&>(pairing->getDutyVec());
	CalculateDuty(duties);
}

void CalculateFdpExtensionWithInFlightRestOfCcForTGRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (_ruleParam->Empty() || rosters.empty()) {
		return;
	}
	for (const auto& roster : rosters) {
		if (roster->pairing != nullptr) {
			vector<Duty*>& duties = const_cast<vector<Duty*>&>(roster->pairing->getDutyVec());
			CalculateDuty(duties);
		}
	}
}

void CalculateFdpExtensionWithInFlightRestOfCcForTGRule::CalculateDuty(vector<Duty*>& duties) {
	if (duties.empty()) {
		return;
	}

	for (auto duty : duties) {
		if (duty == nullptr) {
			continue;
		}

		const FdpExtensionWithInFlightRestForCcConfigParam* matchedFdpExtensionConfig = nullptr;

		for (auto& segment : duty->getSegmentsRead()) {
			auto fdpExtensionConfigParam = FindFdpExtensionConfigParam(duty, segment);
			if (fdpExtensionConfigParam == nullptr) {
				matchedFdpExtensionConfig = nullptr;
				break;
			}

			if (matchedFdpExtensionConfig == nullptr) {
				matchedFdpExtensionConfig = fdpExtensionConfigParam;
			}
			else if (matchedFdpExtensionConfig->GetMaxFdpMinutes() > fdpExtensionConfigParam->GetMaxFdpMinutes()) {
				matchedFdpExtensionConfig = fdpExtensionConfigParam;//Duty多个航段Segment匹配到规则，取MAX FDP配置最小值
			}
		}


		if (matchedFdpExtensionConfig != nullptr) {
			//设置Max FDP扩展
			int maxFdp = duty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);
			if (maxFdp < 0) {
				continue;
			}

			int newMaxFdp = matchedFdpExtensionConfig->GetMaxFdpMinutes();
			if (newMaxFdp > maxFdp) {
				duty->setFdpExtensionMinutes(newMaxFdp - maxFdp);
			}
			duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, newMaxFdp, matchedFdpExtensionConfig->GetId(), matchedFdpExtensionConfig->GetRuleParamId(), matchedFdpExtensionConfig->GetOverrideAbility(), matchedFdpExtensionConfig->GetClassType(), matchedFdpExtensionConfig->GetDescription(), matchedFdpExtensionConfig->GetReference(), true);

			//设置Min Rest
			int minRest = std::max(matchedFdpExtensionConfig->GetMinRestMinutes(), (int)duty->getDPInSecs() / 60);
			duty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, minRest, matchedFdpExtensionConfig->GetId(), matchedFdpExtensionConfig->GetRuleParamId(), matchedFdpExtensionConfig->GetOverrideAbility(), matchedFdpExtensionConfig->GetClassType(), matchedFdpExtensionConfig->GetDescription(), matchedFdpExtensionConfig->GetReference(), true);
			duty->setMinRest(minRest, true);
		}
	}
}

const FdpExtensionWithInFlightRestForCcConfigParam* CalculateFdpExtensionWithInFlightRestOfCcForTGRule::FindFdpExtensionConfigParam(const Duty* duty, const Segment* segment) const {
	for (const auto& fdpExtensionConfigParam : _ruleParam->GetFdpExtensionConfigParam()) {
		if (fdpExtensionConfigParam.MatchParam(duty)) {
			continue;
		}

		//计算航班的in-flight rest
		int inFlightRest = GetInFlightRest(duty, segment, fdpExtensionConfigParam.GetGroup());

		//匹配In-flight Rest Range
		if (!fdpExtensionConfigParam.MatchInFlightRest(inFlightRest)) {
			continue;
		}
		return &fdpExtensionConfigParam;
	}
	return nullptr;
}

const FlightOperationTimeForCcConfigParam* CalculateFdpExtensionWithInFlightRestOfCcForTGRule::FindFlightOperTimeConfigParam(const Segment* segment) const {
	for (const auto& flightOperTimeConfig : _ruleParam->GetFlightOperTimeConfigParam()) {
		if (flightOperTimeConfig.MatchParam(segment)) {
			return &flightOperTimeConfig;
		}
	}
	return nullptr;
}

int CalculateFdpExtensionWithInFlightRestOfCcForTGRule::GetInFlightRest(const Duty* duty, const Segment* segment, const int group) const {
	const auto* flightOperTimeConfig = FindFlightOperTimeConfigParam(segment);
	if (flightOperTimeConfig == nullptr) {
		return 0;
	}

	//Block Time in minutes
	int blkMinutes = static_cast<int>((segment->getEndTimeUtcAct() - segment->getStartTimeUtcAct()) / 60);
	int takeOffMinutes = flightOperTimeConfig->GetTakeOffTimeMinutes();
	int landingMinutes = flightOperTimeConfig->GetLandingTimeMinutes();
	int serviceMinutes = flightOperTimeConfig->GetServiceTimeMinutes();

	//in-flight rest = (BLH - take_off - landing - service) / group
	int inFlightRest = (blkMinutes - takeOffMinutes - landingMinutes - serviceMinutes);
	if (inFlightRest < 0) inFlightRest = 0;

	return inFlightRest / group;
}


void CalculateFdpExtensionWithInFlightRestOfCcForTGRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	if (_ruleParam == nullptr) {
		_ruleParam = std::make_unique<FdpExtensionWithInFlightRestForCcRuleParam>(FdpExtensionWithInFlightRestForCcRuleParam(this));
	}

	for (const auto& dbRule : input.dbRules) {
		_ruleParam->ParseParam(dbRule);
	}
	if (!_ruleParam->Empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParam->ParseParam(singleRuleParamString);
	}
}
