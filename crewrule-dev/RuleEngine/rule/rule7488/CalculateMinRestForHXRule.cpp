/**
 * @file CalculateMinRestForHXRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-02-12
**/

#include "../RuleSytem.h"
#include "CalculateMinRestForHXRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/NumberUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "TimezoneUtils.h"

inline static Duty* GetNextDuty(const std::vector<const ROSTER*>& rosters, const int currRosterIndex) {
	for (size_t rosterIndex = currRosterIndex; rosterIndex < rosters.size(); rosterIndex++) {
		ROSTER* currRoster = const_cast<ROSTER*>(rosters[rosterIndex]);
		if (currRoster->pairing != nullptr) {
			auto& duties = currRoster->pairing->getDutyVec();
			if (!duties.empty()) {
				return duties.front();
			}
		}
	}
	return nullptr;
}

void CalculateMinRestForHXRule::CalculateDuty(Duty* duty) {
	unordered_map<long long, int> unaccAwayFromBaseDutyMap;
	unaccAwayFromBaseDutyMap[duty->getDutyId()] = 0;
	int offsetTZMinutes = (int)(duty->getStartTimeLocAct() - duty->getStartTimeUtcAct()) / 60;
	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	CalculateDuty(duties, unaccAwayFromBaseDutyMap, offsetTZMinutes);
}

void CalculateMinRestForHXRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParam->Empty()) {
		return;
	}
	unordered_map<long long, int> unaccAwayFromBaseDutyMap = GetUnaccAwayFromBaseDurationMap(pairing);
	auto firstDuty = pairing->getFirstDuty();
	int offsetTZMinutes = (int)(firstDuty->getStartTimeLocAct() - firstDuty->getStartTimeUtcAct()) / 60;
    vector<Duty*>& duties = const_cast<vector<Duty*>&>(pairing->getDutyVec());
	CalculateDuty(duties, unaccAwayFromBaseDutyMap, offsetTZMinutes);
}

void CalculateMinRestForHXRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParam->Empty() || rosters.empty()) {
		return;
	}
	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string crewBase = crew->getPrimeBase();
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeLocSch(), crewBase, this->GetDataContext());

    auto unaccAwayFromBaseDutyMap = GetUnaccAwayFromBaseDurationMap(rosters);

	Duty* currDuty = nullptr;
	Duty* nextDuty = nullptr;
    for (size_t rosterIndex = 0; rosterIndex < rosters.size(); rosterIndex++) {
		ROSTER* prevRoster = (rosterIndex == 0) ? nullptr : const_cast<ROSTER*>(rosters[rosterIndex - 1]);
        ROSTER* currRoster = const_cast<ROSTER*>(rosters[rosterIndex]);

		if (currRoster->pairing == nullptr) {
			CalculateGroundRoster(prevRoster, currRoster, offsetTZMinutes);
		}
		else {
			auto& duties = currRoster->pairing->getDutyVec();
			for (size_t dutyIndex = 0; dutyIndex < duties.size(); dutyIndex++) {
				currDuty = duties[dutyIndex];
				nextDuty = ((dutyIndex + 1) == duties.size()) ? nullptr : duties[dutyIndex + 1];

				CalculateDuty(currDuty, nextDuty, prevRoster, currRoster, unaccAwayFromBaseDutyMap, offsetTZMinutes);
			}
		}
	}

}

void CalculateMinRestForHXRule::CalculateDuty(vector<Duty*>& duties, const unordered_map<long long, int>& unaccAwayFromBaseDutyMap, const int offsetTZMinutes) {

	for (size_t i = 0; i < duties.size(); i++) {
		Duty* currDuty = duties[i];
		Duty* nextDuty = ((i + 1 ) == duties.size()) ? nullptr : duties[i+1];
		CalculateDuty(currDuty, nextDuty, nullptr, nullptr, unaccAwayFromBaseDutyMap, offsetTZMinutes);
	}
}

void CalculateMinRestForHXRule::CalculateGroundRoster(ROSTER* prevRoster, ROSTER* currRoster, const int offsetTZMinutes) {
	if (prevRoster != nullptr && prevRoster->pairing == nullptr && currRoster->pairing == nullptr) {
		//当前地面任务占用前一个地面任务的最小休息，则前一个地面任务休息为0
		//第二个任务后根据7488计算值赋值Rest。Rest_End_dt=end_dt+Rest
		if (prevRoster->actRestStrUtc >= currRoster->actStrUtc) {
			prevRoster->actEndLoc = prevRoster->actRestStrLoc;
			prevRoster->actEndUtc = prevRoster->actRestStrUtc;
		}
	}
	for (const auto& ruleParam : _ruleParam->GetStandardMinRestForHXRuleParams()) {
		int dpInMinutes = currRoster->dpMinutes;
		if (ruleParam.MatchParam(currRoster, 0, 0, dpInMinutes)) {
			int minRest = GetGroundRosterMinRest(currRoster, offsetTZMinutes, ruleParam);
			currRoster->actEndLoc = currRoster->actRestStrLoc + (time_t)minRest * 60;
			currRoster->actEndUtc = currRoster->actRestStrUtc + (time_t)minRest * 60;
			break;
		}
	}
}

// 提取的公共处理逻辑
void CalculateMinRestForHXRule::CalculateDuty(Duty* currDuty, Duty* nextDuty, ROSTER* prevRoster, ROSTER* currRoster, 
	const unordered_map<long long, int>& unaccAwayFromBaseDutyMap, const int offsetTZMinutes) {

	int maxTZDiffMinutes = GetMaxTZDiffInDuty(currDuty);
	auto iter = unaccAwayFromBaseDutyMap.find(currDuty->getDutyId());
	int unaccAwayFromBaseDurationOfDuty = (iter == unaccAwayFromBaseDutyMap.end() ? 0 : iter->second);
	int dpInMinutes = currDuty->getDPInSecs() / 60;
	for (const auto& ruleParam : _ruleParam->GetStandardMinRestForHXRuleParams()) {
		if (ruleParam.MatchParam(currDuty, maxTZDiffMinutes, unaccAwayFromBaseDurationOfDuty, dpInMinutes)) {
			int physiologicalRestTimeZoneMinutes = GetPhysiologicalRestTimeZone(currDuty, offsetTZMinutes, ruleParam);
			int minRest = GetDutyMinRest(currDuty, physiologicalRestTimeZoneMinutes, ruleParam);
			//standby rest的计算方式可能会增加min rest的要求，基于前一个Roster的standby情况，调整min rest的要求
			minRest = GetMinRestBasedOnStandby(minRest, currDuty, prevRoster, currRoster, offsetTZMinutes);

			bool force = false;
			bool match = false;
			//获得Layover后最新的MinRest
			minRest = GetAdjustMinRestBasedOnLayover(match, minRest, currDuty, nextDuty);
            
			//获得Meger DP后最新的MinRest
			minRest = GetAdjustMinRestBasedOnMergeDP(match, minRest, currDuty, currRoster, ruleParam);
			if (match) {
				force = true;
			}

			//currDuty->setMinRest(minRest, force);
			currDuty->setMinRestAndTimeZone(minRest, physiologicalRestTimeZoneMinutes, force);
			currDuty->setMinRestAtBase(minRest, force);
			currDuty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, minRest, ruleParam.GetId(), ruleParam.GetRuleParamId(), ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference());
			break;
		}
	}
}

int CalculateMinRestForHXRule::GetAdjustMinRestBasedOnLayover(bool& match, const int minRest, const Duty* currDuty, const Duty* nextDuty) const {
	if (nextDuty == nullptr) {
		return minRest;
	}
	for (auto& adjustMinRestRuleParam : _ruleParam->GetAdjustMinRestForHXRuleParams()) {
		if (adjustMinRestRuleParam.MatchMinRestRange(minRest)) {
			match = true;
			return adjustMinRestRuleParam._hotelMinRestMinutes;
		}
	}
	return minRest;
}

int CalculateMinRestForHXRule::GetAdjustMinRestBasedOnMergeDP(bool& match, const int minRest, const Duty* currDuty, const ROSTER* currRoster, const StandardMinRestForHXRuleParam& ruleParam) const {
	if (ruleParam._isCompareWithDutyDP == nullptr || !(*ruleParam._isCompareWithDutyDP) || currRoster == nullptr) {
		return minRest;
	}
	int dutyIndex = 0;
	if (currDuty != nullptr) {
		dutyIndex =  currDuty->getDutySeq() - 1;
	}
	int mergeDP	= const_cast<ROSTER*>(currRoster)->dutyValues.getMergeDp(dutyIndex);
	if (mergeDP > 0) {
		return mergeDP;
	}
	return minRest;
}

int CalculateMinRestForHXRule::GetMinRestBasedOnStandby(const int minRest, const Duty* currDuty, const ROSTER* prevRoster, const ROSTER* currRoster, const int offsetTZMinutes) const {
    int newMinRest = minRest;
	if (prevRoster == nullptr || currRoster == nullptr) {
		return newMinRest;
	}
	auto& standbyFDPAndRestDefinitions = RuleParams::GetInstancePtr()->getStandbyFDPAndRestDefinitions();
	for (auto& standbyFDPAndRestDefinition : standbyFDPAndRestDefinitions) {
		if (!standbyFDPAndRestDefinition->match(prevRoster, currRoster)) {
			continue;
		}
		if (standbyFDPAndRestDefinition->actualRestCalculate == "DUTYREST") {
			newMinRest = minRest;
		}
        else if (standbyFDPAndRestDefinition->actualRestCalculate == "DUTYREST+SBY") {
			if (prevRoster->calloutUtc <= 0) {
				newMinRest = minRest;
			}
			else {
				time_t sbyStartTimeLoc = prevRoster->actStrUtc + (time_t)offsetTZMinutes * 60;
				time_t sbyEndTimeLoc = prevRoster->calloutUtc + (time_t)offsetTZMinutes * 60;
				int sbyDuration = TimeUtils::GetDuration(sbyStartTimeLoc, sbyEndTimeLoc, standbyFDPAndRestDefinition->restExcludeSbyWindowStart, standbyFDPAndRestDefinition->restExcludeSbyWindowEnd);
				sbyDuration = sbyDuration / 60; // convert to minutes
				newMinRest = minRest + NumberUtils::Ceil(sbyDuration * standbyFDPAndRestDefinition->standbyRestRatioValue);
			}
		}
		else if (standbyFDPAndRestDefinition->actualRestCalculate == "SBYSTART~DUTYEND") {
			newMinRest = static_cast<int>(currDuty->getEndTimeUtcAct() - prevRoster->actStrUtc) / 60;
		}
		else {
			//default to DUTYREST
			newMinRest = minRest;
		}
		break;
	}
	return newMinRest;
}

void CalculateMinRestForHXRule::ParseParam(const InputType& input) {
	if (_ruleParam == nullptr) {
		_ruleParam = std::make_unique<CalculateMinRestForHXRuleParam>(CalculateMinRestForHXRuleParam(this));
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

unordered_map<long long, int> CalculateMinRestForHXRule::GetUnaccAwayFromBaseDurationMap(const std::vector<const ROSTER*>& rosters) const {
	unordered_map<long long, int> results;
	Duty* accDutyAtBase = nullptr;//在基地的适应状态的Duty
	Duty* firstUnaccDuty = nullptr;//在accDutyAtBase（适应状态）之后出现的第一个未适应状态的Duty
	for (auto& roster : rosters) {
		if (roster->pairing == nullptr) {
			continue;
		}
		Duty* firstDuty = roster->pairing->getFirstDuty();
		if (firstDuty->getAcclimatisedState() == AcclimatizationState::ACCLIMATIZED) {
			accDutyAtBase = firstDuty;
			firstUnaccDuty = nullptr;
		}
		for (auto& duty : roster->pairing->getDutyVec()) {
			if (duty->getAcclimatisedState() != AcclimatizationState::ACCLIMATIZED) {
				if (firstUnaccDuty == nullptr) {
					firstUnaccDuty = duty;
				}
			}
			if (accDutyAtBase == nullptr || firstUnaccDuty == nullptr) {
				results[duty->getDutyId()] = 0;
			}
			else {
				int duration = (int)(firstUnaccDuty->getStartTimeUtcAct() - accDutyAtBase->getStartTimeUtcAct()) / 60;
				results[duty->getDutyId()] = duration;
			}

		}
	}
	return results;
}

unordered_map<long long, int> CalculateMinRestForHXRule::GetUnaccAwayFromBaseDurationMap(const Pairing* pairing) const {
	unordered_map<long long, int> results;
	Duty* accDutyAtBase = nullptr;//在基地的适应状态的Duty
	Duty* firstUnaccDuty = nullptr;//在accDutyAtBase（适应状态）之后出现的第一个未适应状态的Duty

	Duty* firstDuty = pairing->getFirstDuty();
	if (firstDuty->getAcclimatisedState() == AcclimatizationState::ACCLIMATIZED) {
		accDutyAtBase = firstDuty;
		firstUnaccDuty = nullptr;
	}

	for (auto& duty : pairing->getDutyVec()) {
		if (duty->getAcclimatisedState() != AcclimatizationState::ACCLIMATIZED) {
			if (firstUnaccDuty == nullptr) {
				firstUnaccDuty = duty;
			}
		}
		if (accDutyAtBase == nullptr || firstUnaccDuty == nullptr) {
			results[duty->getDutyId()] = 0;
		}
		else {
			int duration = (int)(firstUnaccDuty->getStartTimeUtcAct() - accDutyAtBase->getStartTimeUtcAct()) / 60;
			results[duty->getDutyId()] = duration;
		}
	}
	return results;
}

unordered_map<long long, std::tuple<ROSTER*,ROSTER*>> CalculateMinRestForHXRule::GetPrevRosterMap(const std::vector<const ROSTER*>& rosters) const {
    unordered_map<long long, std::tuple<ROSTER*, ROSTER*>> results;
    ROSTER* prevRoster = nullptr;
    for (auto& roster : rosters) {
		if (roster->pairing != nullptr) {
			auto firstDuty = roster->pairing->getFirstDuty();
			results[firstDuty->getDutyId()] = std::make_tuple(prevRoster, const_cast<ROSTER*>(roster));
		}
		prevRoster = const_cast<ROSTER*>(roster);
	}
	return results;
}

int CalculateMinRestForHXRule::GetMaxTZDiffInDuty(const Duty* duty) const {
	int maxTzDiff = -1;//
    Segment* firstSegment = duty->getFirstSegment();
	int tzOfBase = SegmentUtils::GetTimeZoneOffsetByDep(*firstSegment, this->_dbData);//基准时区
	for (auto& segment : duty->getSegmentsRead()) {
		int tzOfDep = SegmentUtils::GetTimeZoneOffsetByDep(*segment, this->_dbData);
		int tzDiff = TimezoneUtils::abs(tzOfDep - tzOfBase);
        if (tzDiff > maxTzDiff) {
			maxTzDiff = tzDiff;
		}

		int tzOfArr = SegmentUtils::GetTimeZoneOffsetByArr(*segment, this->_dbData);
		tzDiff = TimezoneUtils::abs(tzOfArr - tzOfBase);
		if (tzDiff > maxTzDiff) {
			maxTzDiff = tzDiff;
		}
	}
	return maxTzDiff;
}

int CalculateMinRestForHXRule::GetDutyMinRest(const Duty* duty, const int offsetTZMinutes, const StandardMinRestForHXRuleParam& ruleParam) const {
	int minRest = 0;
	if (ruleParam._isCompareWithDutyDP == nullptr || !(*ruleParam._isCompareWithDutyDP)) {
		minRest = ruleParam._standardMinRestMinutes;
	}
	else {
        int dpInMinutes = duty->getDPInSecs() / 60;
		minRest = std::max(ruleParam._standardMinRestMinutes, dpInMinutes);
	}

    //如果需要生理休息，且Duty与当地夜间时间有重叠，则Min Rest增加生理休息的额外分钟数
	if (ruleParam._isPhysiologicalRest != nullptr && *ruleParam._isPhysiologicalRest) {
        minRest = GetMinRestMeetingLocalNight(duty, minRest, offsetTZMinutes);
	}
	return minRest;
}

int CalculateMinRestForHXRule::GetGroundRosterMinRest(const ROSTER* roster, const int offsetTZMinutes, const StandardMinRestForHXRuleParam& ruleParam) const {
	int minRest = 0;

	if (ruleParam._isCompareWithDutyDP == nullptr || !(*ruleParam._isCompareWithDutyDP)) {
		minRest = ruleParam._standardMinRestMinutes;
	}
	else {
		//如果Roster的DP_PCT小于等于0，则DP为0，此时Min Rest也为0
		auto iterAssignment = _dbData->assignmentNameMap.find(roster->qualifier);
		if (iterAssignment != _dbData->assignmentNameMap.end() && iterAssignment->second->DP_PCT <=0 ) {
			return 0;
		}

		int dpInMinutes = roster->dpMinutes;
		minRest = std::max(ruleParam._standardMinRestMinutes, dpInMinutes);
		
		//合并DP之后，以DP计算MinRest
		int mergeDP	= const_cast<ROSTER*>(roster)->dutyValues.getMergeDp(0);
		if (mergeDP > 0) {
			minRest = mergeDP;
		}
	}

	return minRest;
}

int CalculateMinRestForHXRule::GetMinRestMeetingLocalNight(const Duty* duty, const int minRest, const int offsetTZMinutes) const {
	time_t actRestStartTimeLoc = duty->getLastDropoff()->getEndTimeUtcAct() + offsetTZMinutes * 60;
	time_t actRestEndTimeLoc = actRestStartTimeLoc + minRest * 60;
	//获得满足本地夜晚时间的休息结束时间(最小休息结束时间点)
	time_t restEndTimeMeetingLocalNightLoc = DutyUtils::GetRestEndTimeMeetingLocalNight(actRestStartTimeLoc, actRestEndTimeLoc, 0);
	if (restEndTimeMeetingLocalNightLoc < 0) {
		return -1;
	}
	return (int)(restEndTimeMeetingLocalNightLoc - actRestStartTimeLoc) / 60;
}

int CalculateMinRestForHXRule::GetPhysiologicalRestTimeZone(const Duty* duty, const int offsetTZMinutes, const StandardMinRestForHXRuleParam& ruleParam) const {
	int physiologicalRestTimeZoneMinutes = offsetTZMinutes;//默认Base时区
	if (ruleParam._isPhysiologicalRest != nullptr && *ruleParam._isPhysiologicalRest) {

		if (ruleParam._physiologicalRestTimeZone == "LOCAL") {
			physiologicalRestTimeZoneMinutes = (int)(duty->getEndTimeLocAct() - duty->getEndTimeUtcAct()) / 60;
		}
	}
	return physiologicalRestTimeZoneMinutes;
}