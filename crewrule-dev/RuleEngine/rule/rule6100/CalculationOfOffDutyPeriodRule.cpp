/**
 * @file CalculationOfOffDutyPeriodRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CalculationOfOffDutyPeriodRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/PhaseUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "TimezoneUtils.h"
#include <cmath>

void CalculationOfOffDutyPeriodRule::CalculateDuty(Duty *duty) {
	if (this->_ruleParams.empty()) {
		return;
	}

	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	CalculateDuty(duties);
}

void CalculationOfOffDutyPeriodRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}

	CalculateDuty(pairing->getDutyVec());
}

void CalculationOfOffDutyPeriodRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return;
	}

	time_t checkedStartTime = 0, checkedEndTime = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		checkedStartTime = this->_dbData->scenario.startDtUTC;
		checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		checkedStartTime = rosters[0]->actStrUtc;
		checkedEndTime = rosters[rosters.size() - 1]->restStrUtc;
	}
	for (const auto & ruleParam : _ruleParams) {
		for (auto roster : rosters) {
			std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[roster->idcrew];
			if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
				break;
			}
			Pairing* pairing = nullptr;
			if (roster->pairId != 0 && _dbData->pairingIdMap.find(roster->pairId) != _dbData->pairingIdMap.end()) {
				pairing = _dbData->pairingIdMap[roster->pairId];
			}
			if (pairing == nullptr) {
				//TODO 地面任务如何处理？？？？ by hexd
				return;
			}
			if (pairing != nullptr && !PhaseUtils::IsChecked(pairing, ruleParam.GetPhase(), this->_dbData)) {
				continue;
			}	
			std::string base{}; // left blank will use the context find pairing id from currDuty or segment
			if (this->IsPairingOptimizerModel()) {
				base = pairing->getDuty(0)->getDepStationRead(); // PO can't get pairing from either currDuty or segments
			}
			for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
				Duty* currDuty = pairing->getDuty(i);
				CalculateDuty(currDuty, base, ruleParam);
			}
		}
	}
}

void CalculationOfOffDutyPeriodRule::CalculateDuty(const vector<Duty*>& duties) {
	if (duties.empty()) {
		return;
	}

	std::string base; // left blank will use the context find pairing id from currDuty or segment
	if (this->IsPairingOptimizerModel()) {
		base = duties.front()->getDepStationRead(); // PO can't get pairing from either currDuty or segments
	}
	//for (auto& duty : duties) {
	for (std::size_t i = 0; i < duties.size(); i++) {
		Duty* currDuty = duties.at(i);
		for (const auto & ruleParam : _ruleParams) {
			if (currDuty != nullptr && !PhaseUtils::IsChecked(currDuty, ruleParam.GetPhase(), this->_dbData)) {
				continue;
			}
			
			if (!CalculateDuty(currDuty, base, ruleParam)) {
				break;
			}
		}
	}
}

bool CalculationOfOffDutyPeriodRule::CalculateDuty(Duty *currDuty, const std::string& base, const CalculationOfOffDutyPeriodRuleParam& ruleParam) const{
	bool next = true;

	//针对Split Duty减少相应的FDP时长，在6020中设置
	int dutyFdpMinutes = currDuty->getActualFDP() - currDuty->getDeltaFDPAfterRest();

	int minRest = 0;

	std::string direction = DutyUtils::GetDisplacementDirection(*currDuty, _dbData);
	if (ruleParam.MatchDutyAssignments(*currDuty) && ruleParam.MatchDutyTzDiff(*currDuty) &&
		ruleParam.MatchSectorBlhRanges(*currDuty) &&
		ruleParam.MatchAcclimatizedState(currDuty) && ruleParam.MatchHomeBase(*currDuty, base, this->_dbData) &&
		ruleParam.MatchDirection(direction) && ruleParam.MatchFDPThredhold(*currDuty, dutyFdpMinutes)) {

		int displacementAdjustmentMinutes = GetDisplacementAdjustment(currDuty, direction, ruleParam);
		int fdpAdjustmentMinutes = GetFDPAdjustment(dutyFdpMinutes, ruleParam);

		//step1: 
		// At Home Base and FDP Time <= 12:00
		//minRest = ruleParam._restTimeMinutes + displacementAdjustmentMinutes;
		
		//step2:
		//if (At Home Base and FDP Time > 12:00 and FCM is Acclimated)
		// or
		//if (FDP Time > 12:00 and FCM is in an Unknown State Acclimatisation)
		// or
		// If (at home base and acclimatized to any location)
		//etc.
		//minRest = ruleParam._restTimeMinutes + displacementAdjustmentMinutes + fdpAdjustmentMinutes;

		minRest = ruleParam._restTimeMinutes + displacementAdjustmentMinutes + fdpAdjustmentMinutes;
		
		currDuty->setMinRest(minRest);
		currDuty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, minRest, ruleParam.GetId(), ruleParam.GetRuleParamId(),ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference());
		next = false;
	}
	return next;
}

int CalculationOfOffDutyPeriodRule::GetDisplacementAdjustment(const Duty* currDuty, const string& direction, const CalculationOfOffDutyPeriodRuleParam& ruleParam) const {
	int displacementAdjustmentMinutes = 0;

	if (currDuty->getAcclimatisedStateForRestStart() == AcclimatizationState::UNKNOWN) {
		//the crew is in an unknown state
		displacementAdjustmentMinutes = TimezoneUtils::abs(GetDisplacementTime(*currDuty));
	}
	else {
		int displacementTime = GetDisplacementTime(*currDuty);
		if (ruleParam._displaceAdjustReferTimeMinutes == nullptr) {
			displacementAdjustmentMinutes = displacementTime;
			return displacementAdjustmentMinutes;
		}

		if (direction == DisplacementDirection::EAST) {
			//向东 displacementTime 和 ruleParam._displaceAdjustReferTimeMinutes 大于等于0
			if (displacementTime >= *ruleParam._displaceAdjustReferTimeMinutes) {
				//向东飞行，如果时区差不小于2时，Displacement Adjust=时区差;如果时区差小于2小时，Displacement Adjust=0;(ROSCRW-7135)
				displacementAdjustmentMinutes = TimezoneUtils::abs(displacementTime);
			}
		}
		else {
			//向西,  displacementTime 和 ruleParam._displaceAdjustReferTimeMinutes 小于0
			if (TimezoneUtils::abs(displacementTime) >= std::abs(*ruleParam._displaceAdjustReferTimeMinutes)) {
				//向西飞行，如果时区差不小于3时，Displacement Adjust=时区差；如果时区差小于3小时，Displacement Adjust=0；(ROSCRW-7135)
				displacementAdjustmentMinutes = TimezoneUtils::abs(displacementTime);
			}
		}
	}
	return displacementAdjustmentMinutes;
}



int CalculationOfOffDutyPeriodRule::GetFDPAdjustment(const int& dutyFdpMinutes, const CalculationOfOffDutyPeriodRuleParam& ruleParam) const {
	//If the FDP Time is greater than 12:00, then FDP Adjustment = 1.5 * (FDP Time – 12:00)
	//向下取整
	int fdpAdjustmentMinutes = (int)std::floor(ruleParam._fdpTimes * (dutyFdpMinutes - ruleParam._periodThredholdMinutesLower));
	//向上取整 fdpAdjustmentMinutes = std::ceil(ruleParam._fdpTimes * (dutyFdpMinutes - ruleParam._fdpThredholdMinutes));
	//四舍五入 fdpAdjustmentMinutes = std::round(ruleParam._fdpTimes * (dutyFdpMinutes - ruleParam._fdpThredholdMinutes));
		
	return fdpAdjustmentMinutes;
}

int CalculationOfOffDutyPeriodRule::GetDisplacementTime(const Duty& duty) const {
	int refTimezoneOffset = duty.getRefTimeZone();
	if (refTimezoneOffset == INT_MIN) {
		//Duty未设置RefTimeZone，则采用Duty时区差
		return DutyUtils::GetTimeZoneDiff(duty, _dbData);
	}
	int displacementTime = 0;
	int maxDisplacementTime = INT_MIN;
	for (auto& segment : duty.getSegments()) {
		//起飞机场
		int depTimezoneOffset = SegmentUtils::GetTimeZoneOffsetByDep(*segment, _dbData);
		int tmpdisplacementTime = TimezoneUtils::abs(depTimezoneOffset - refTimezoneOffset);
		if (tmpdisplacementTime > maxDisplacementTime) {
			maxDisplacementTime = tmpdisplacementTime;
			displacementTime = depTimezoneOffset - refTimezoneOffset;
		}

		//落地机场
		int arrTimezoneOffset = SegmentUtils::GetTimeZoneOffsetByArr(*segment, _dbData);
		tmpdisplacementTime = TimezoneUtils::abs(arrTimezoneOffset - refTimezoneOffset);
		if (tmpdisplacementTime > maxDisplacementTime) {
			maxDisplacementTime = tmpdisplacementTime;
			displacementTime = arrTimezoneOffset - refTimezoneOffset;
		}
	}
	return displacementTime;
}

void CalculationOfOffDutyPeriodRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CalculationOfOffDutyPeriodRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CalculationOfOffDutyPeriodRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}