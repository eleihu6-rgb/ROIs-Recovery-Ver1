/**
 * @file MaxFlightDutyBySplitDutyRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "CalculateSplitDutyMaxFdpExtensionForTGRule.h"
#include <cfloat>
#include <algorithm>
#include "../RuleSytem.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/DutyUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

void CalculateSplitDutyMaxFdpExtensionForTGRule::CalculateDuty(Duty* duty) {
	if (this->_ruleParams.empty()) {
		return;
	}

	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	CalculateDuty(duties);
}

void CalculateSplitDutyMaxFdpExtensionForTGRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}

	CalculateDuty(pairing->getDutyVec());
}

void CalculateSplitDutyMaxFdpExtensionForTGRule::CalculateDuty(const vector<Duty*>& duties) {
	if (duties.empty()) {
		return;
	}

	std::string base; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = duties.front()->getDepStationRead(); // PO can't get pairing from either duty or segments
	}

	for (auto& duty : duties) {
		for (const auto& ruleParam : _ruleParams) {
			if (!CalculateDuty(duty, ruleParam)) {
				break;
			}
		}
	}
}

bool CalculateSplitDutyMaxFdpExtensionForTGRule::CalculateDuty(Duty* duty, const CalculateSplitDutyMaxFdpExtensionForTGRuleParam& ruleParam) {
	bool next = true;
	const auto& segments = duty->getSegmentsRead();
	auto matchSegmentNodeId = [](const long long nodeSegmentId, const Segment* segment) {
		// Split-duty nodes may carry either input segment ids or legacy flight ids.
		return nodeSegmentId == segment->getSegmentId() || nodeSegmentId == segment->getDBId();
	};
	for (size_t i = 0; i < segments.size() - 1; i++) {
		if (ruleParam.MatchParam(*segments[i], *segments[i + 1])) {
			// 只有有segment层级的node才启用
			bool hasSplit = false;
			const auto& nodes = duty->pairingDutyNodes;
			time_t splitDutyStartTime = segments[i]->getEndTimeLocAct() + ruleParam._dummyBriefTimeMinutes * 60 + ruleParam._travelTimeToFromHotelMinutes * 60 / 2;
			time_t splitDutyEndTime = segments[i + 1]->getStartTimeLocAct() - ruleParam._dummyReleaseTimeMinutes * 60 - ruleParam._travelTimeToFromHotelMinutes * 60 / 2;
			for (const auto& node : nodes) {
				if (node->getType() == "SEGMENT" && node->getNode() == "DROPOFF" && matchSegmentNodeId(node->getFromSegmentId(), segments[i])) {
					hasSplit = true;
					splitDutyStartTime = node->getEndTimeLocAct();
				}
				if (node->getType() == "SEGMENT" && node->getNode() == "PICKUP" && matchSegmentNodeId(node->getToSegmentId(), segments[i + 1])) {
					hasSplit = true;
					splitDutyEndTime = node->getStartTimeLocAct();
				}
			}
			if (!hasSplit)
				continue;


			/*if (!DutyUtils::IsWoclTime(splitDutyStartTime, splitDutyEndTime, 0) && (splitDutyEndTime - splitDutyStartTime) / 60 >= ruleParam._minSplitDutyLengthMinutes) {
				int maxFdpMin = duty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);
				int extensionFdpMin = ruleParam.GetExtensionMaxFdpMinutes(splitDutyStartTime, splitDutyEndTime);
				duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, maxFdpMin + extensionFdpMin, ruleParam.GetId(), ruleParam.GetRuleParamId(),ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference(), true);

				next = false;
			}*/

			int nonOverlappingTime = DutyUtils::GetWoclNonOverlappingTime(splitDutyStartTime, splitDutyEndTime, 0);
			nonOverlappingTime -= ruleParam._travelTimeToFromHotelMinutes;
			// 【ROSCRW-18828】 [BUG][TG][RULE]7028法规当split duty恰好为3小时, MAX FDP没有扩展
			if (nonOverlappingTime >= ruleParam._minSplitDutyLengthMinutes) {
				int maxFdpMin = duty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);
				int extensionFdpMin = min(ruleParam._maxSplitDutyLengthMinutes, nonOverlappingTime) * ruleParam._extensionMaxFdpPctValue;
				duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, maxFdpMin + extensionFdpMin, ruleParam.GetId(), ruleParam.GetRuleParamId(),ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference(), true);

				next = false;
			}
			
			
		}
	}
	
	return next;
}

void CalculateSplitDutyMaxFdpExtensionForTGRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CalculateSplitDutyMaxFdpExtensionForTGRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
}
