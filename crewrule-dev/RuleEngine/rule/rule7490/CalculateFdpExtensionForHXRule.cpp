/**
 * @file CalculateFdpExtensionForHXRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2026-02-12
**/

#include "../RuleSytem.h"
#include "CalculateFdpExtensionForHXRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/SegmentUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "TimezoneUtils.h"
#include <algorithm>

void CalculateFdpExtensionForHXRule::CalculateDuty(Duty* duty) {
	if (this->_ruleParams.empty())
		return;

	
	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	CalculateDuty(duties);
}

void CalculateFdpExtensionForHXRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}
	
	vector<Duty*>& duties = const_cast<vector<Duty*>&>(pairing->getDutyVec());
	CalculateDuty(duties);
}

void CalculateFdpExtensionForHXRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
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

void CalculateFdpExtensionForHXRule::CalculateDuty(vector<Duty*>& duties, const ROSTER* preRoster) {
	
	for (size_t i = 0; i < duties.size(); i++) {

		const auto& pairId = duties[i]->getPairingId();

		time_t restStartTime = 0;
		time_t restEndTime = duties[i]->getFirstPickup() ? duties[i]->getFirstPickup()->getStartTimeUtcAct() : duties[i]->getStartTimeUtcAct();
		if (i == 0) {
			if (preRoster) {
				restStartTime = preRoster->getRestStartUtcAct();
			}
		}
		else {
			restStartTime = duties[i - 1]->getLastDropoff() ? duties[i - 1]->getLastDropoff()->getEndTimeUtcAct() : duties[i - 1]->getEndTimeUtcAct();
		}

		time_t fdpStartTime = duties[i]->getFDPStartUtcTimes();

		for (const auto& ruleParam : _ruleParams) {
			if (!ruleParam.MatchParam(duties[i], restStartTime, restEndTime)) {
				continue;
			}
			int totalRestInFlight = 0;

			for (const auto& segment : duties[i]->getSegmentsRead()) {
				//获取航班休息时间
				int maxWorkingTimeInFlight = GetMinRestInFlight(segment, duties[i]);

				int crewNum = ruleParam.GetCrewNumber(segment);

				int restFacCnt = ruleParam.GetFacilityNumber(segment);

				int restInFlight = ruleParam.CalculateCrewMaxRestMinutes(
					maxWorkingTimeInFlight,
					segment->getBlkMinutes(),
					crewNum,
					restFacCnt);

				totalRestInFlight += restInFlight;
			}

			int fdpExtension = (int)(totalRestInFlight * ruleParam._extendFdpPct);

			int maxFdp = duties[i]->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);
			const auto& limit = duties[i]->getLimiation(RULE_LIMITATION_TYPE::MAX_FDP);
			//之前没有算出maxFdp，不用扩展
			if (maxFdp < 0 || limit->ruleParamId == ruleParam.GetRuleParamId()) {
				break;
			}

			int lastMaxFdp = ruleParam.GetMaxFdp(duties[i], maxFdp + fdpExtension);

			//duties[i]->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, lastMaxFdp, ruleParam.GetId(), ruleParam.GetRuleParamId(), ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference(), true, true);
			
			if (maxFdp != lastMaxFdp)
				//记录扩展值
				duties[i]->setExtendFdpMin(lastMaxFdp - maxFdp);
			break;
		}
		
	}
}

void CalculateFdpExtensionForHXRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CalculateFdpExtensionForHXRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CalculateFdpExtensionForHXRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

int CalculateFdpExtensionForHXRule::GetMinRestInFlight(const Segment* segment, const Duty* duty) const {
	const auto& iter = this->_dbData->crewOnFlt.find(segment->getDBId());
	if (iter == this->_dbData->crewOnFlt.end() || iter->second.empty()) {
		//如果没排人，默认fdp上限都可以达到要求
		int dutyMaxFdp = duty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);
		int restInFlight = CalculateRestInFlightByMaxFDP(dutyMaxFdp, segment, duty->getFDPStartUtcTimes());
		return restInFlight;
	}

	//客舱获取落地时最小人数中的最小空中休息时间
	const auto& crewsOnFlight = iter->second;
	int minRest = INT_MAX;
	for (const auto& cop : crewsOnFlight) {
		const auto& roster = this->_dbData->findRosterByPairing(cop->crewId, segment->getPairingId());
		if (roster) {
			//获取fdp上限
			int rosterMaxFdp = roster->dutyValues.getMaxFdp(duty->getDutySegNum() - 1);
			if (rosterMaxFdp == 0) {
				rosterMaxFdp = duty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);
			}
			int restInFlight = CalculateRestInFlightByMaxFDP(rosterMaxFdp, segment, duty->getFDPStartUtcTimes());
			minRest = std::min(minRest, restInFlight);
		}
	}

	if (minRest == INT_MAX) {
		int dutyMaxFdp = duty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);
		return CalculateRestInFlightByMaxFDP(dutyMaxFdp, segment, duty->getFDPStartUtcTimes());
	}

	return minRest;
}

int CalculateFdpExtensionForHXRule::CalculateRestInFlightByMaxFDP(const int maxFdpMinutes, const Segment* segment, const time_t fdpStartTime) const {

	if (maxFdpMinutes <= 0) {
		return 0;
	}

	int elapsedBeforeFlight = 0;
	if (segment->getStartTimeUtcAct() > fdpStartTime) {
		elapsedBeforeFlight = static_cast<int>((segment->getStartTimeUtcAct() - fdpStartTime) / 60);
	}

	int maxWorkingTime = maxFdpMinutes - elapsedBeforeFlight;
	int blkMinutes = static_cast<int>(segment->getBlkMinutes());
	return std::min(std::max(maxWorkingTime, 0), blkMinutes);

	const auto& fdpEndTime = fdpStartTime + maxFdpMinutes * 60;

	int takeOffAndLandingMinutes = GetTakeOffAndLandingMinutesByFdpLimit(maxFdpMinutes, segment, fdpStartTime);


	// FDP上限在航班起飞之后
	if (segment->getStartTimeUtcAct() < fdpEndTime) {
		return segment->getBlkMinutes() - takeOffAndLandingMinutes;
	}
	return 0;
}

int CalculateFdpExtensionForHXRule::GetTakeOffAndLandingMinutesByFdpLimit(const int maxFdpMinutes, const Segment* segment, const time_t fdpStartTime) const {

	const auto& fdpEndTime = fdpStartTime + maxFdpMinutes * 60;

	int minutes = 0;


	if (segment->getStartTimeUtcAct() > fdpEndTime) {
		return minutes;
	}

	if (segment->getStartTimeUtcAct() < fdpEndTime) {
		minutes += 30;
	}

	if (segment->getEndTimeUtcAct() < fdpEndTime) {
		minutes += 30;
	}

	if (segment->getEndTimeUtcAct() > fdpEndTime) {
		int noFdpMinutes = (segment->getEndTimeUtcAct() - fdpEndTime) / 60;

		if (noFdpMinutes >= 30)
			minutes += noFdpMinutes;
		else
			minutes += 30;
	}

	return minutes;

}
