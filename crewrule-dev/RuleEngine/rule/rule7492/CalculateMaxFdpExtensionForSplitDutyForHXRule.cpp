/**
 * @file CalculateMaxFdpExtensionForSplitDutyForHXRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2026-03-30
**/

#include "CalculateMaxFdpExtensionForSplitDutyForHXRule.h"
#include "Utility.h"

#include <ctime>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
#include <OrLog.h>
#include "UtilDbg.h"
#include "StringUtil.h"
#include "CalculateMaxFdpExtensionForSplitDutyForHXRuleParam.h"
#include "../utils/DutyUtils.h"
#include "../utils/SegmentUtils.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"
#include "TimezoneUtils.h"

void CalculateMaxFdpExtensionForSplitDutyForHXRule::CalculateDuty(Duty* duty) {
	if (this->_ruleParams.empty())
		return;

	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	CalculateDuty(duties);
}

void CalculateMaxFdpExtensionForSplitDutyForHXRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}

	vector<Duty*>& duties = const_cast<vector<Duty*>&>(pairing->getDutyVec());
	CalculateDuty(duties);
}

void CalculateMaxFdpExtensionForSplitDutyForHXRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return;
	}

	ROSTER* preRoster = nullptr;
	for (auto& roster : rosters) {
		if (roster->pairing) {
			vector<Duty*>& duties = const_cast<vector<Duty*>&>(roster->pairing->getDutyVec());
			CalculateDuty(duties, preRoster);
			preRoster = const_cast<ROSTER*>(roster);
		}
	}
}

void CalculateMaxFdpExtensionForSplitDutyForHXRule::CalculateDuty(vector<Duty*>& duties, const ROSTER* preRoster) {

	for (size_t i = 0; i < duties.size(); i++) {

		const auto& pairId = duties[i]->getPairingId();

		for (const auto& ruleParam : _ruleParams) {
			if (!ruleParam.MatchParam(duties[i], 0, 0)) {
				continue;
			}

			//获取当前duty的MAX_FDP限制值
			int maxFdp = duties[i]->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);

			//计算因LT休息时间带来的FDP延长值
			int fdpExtension = CalculateFdpExtensionByLtRest(duties[i], ruleParam);

			if (fdpExtension > 0) {
				duties[i]->setExtendFdpMin(fdpExtension);
				duties[i]->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, maxFdp + fdpExtension, ruleParam.GetId(), ruleParam.GetRuleParamId(), ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference(), true);
			}
			return;
		}

	}
}

int CalculateMaxFdpExtensionForSplitDutyForHXRule::CalculateFdpExtensionByLtRest(const Duty* duty, const CalculateMaxFdpExtensionForSplitDutyForHXRuleParam& ruleParam) const {
	int fdpExtension = 0;

	//参考rule3007的LT休息时间计算逻辑
	if (ruleParam._ltRestThreadholdMinutes > 0 && ruleParam._ltRestRatio > 0) {
		if (duty->getNumSegments() > 1) {
			for (size_t i = 0; i < duty->getNumSegments() - 1; i++) {
				auto currentSeg = duty->getSegments()[i];
				auto nextSeg = duty->getSegments()[i + 1];
				if (SegmentUtils::existNode(duty, currentSeg, nextSeg)) {
					if (!MatchSplitFdpLimits(duty, currentSeg, nextSeg, ruleParam)) {
						return 0;
					}
					long ltTime = SegmentUtils::GetActualRestMinutes(duty, currentSeg, nextSeg) * 60;
					if (ltTime >= ruleParam._ltRestThreadholdMinutes * 60) {
						fdpExtension += (int)(ruleParam._ltRestRatio * (ltTime / 60.0));
					}
				}
			}
		}
	}

	return fdpExtension;
}

bool CalculateMaxFdpExtensionForSplitDutyForHXRule::MatchSplitFdpLimits(
	const Duty* duty,
	const Segment* currentSeg,
	const Segment* nextSeg,
	const CalculateMaxFdpExtensionForSplitDutyForHXRuleParam& ruleParam) const {
	if ((ruleParam._preSplitMaxFdpStr.empty() || ruleParam._preSplitMaxFdpStr == RuleParamConstant::ALL) &&
		(ruleParam._postSplitMaxFdpStr.empty() || ruleParam._postSplitMaxFdpStr == RuleParamConstant::ALL)) {
		return true;
	}

	time_t splitRestStartUtc = 0;
	time_t splitRestEndUtc = 0;
	SegmentUtils::GetActualRestStartAndEndTimeUtc(splitRestStartUtc, splitRestEndUtc, currentSeg, nextSeg);

	auto dutyPtr = const_cast<Duty*>(duty);
	const auto& dbData = this->GetDataContext();
	int preSplitFdpMinutes = static_cast<int>(DutyUtils::GetDutyFDPInMinsWithTruncation(
		dutyPtr, duty->getStartTimeUtcAct(), splitRestStartUtc, dbData));
	int postSplitFdpMinutes = static_cast<int>(DutyUtils::GetDutyFDPInMinsWithTruncation(
		dutyPtr, splitRestEndUtc, duty->getEndTimeUtcAct(), dbData));

	return ruleParam.MatchPreSplitMaxFdp(preSplitFdpMinutes)
		&& ruleParam.MatchPostSplitMaxFdp(postSplitFdpMinutes);
}

void CalculateMaxFdpExtensionForSplitDutyForHXRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CalculateMaxFdpExtensionForSplitDutyForHXRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CalculateMaxFdpExtensionForSplitDutyForHXRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}
