/**
 * @file CheckOffDutyPeriodRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckOffDutyPeriodRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "../period/WorkPeriod.h"
#include "TimezoneUtils.h"
#include <cmath>

bool CheckOffDutyPeriodRule::CheckRule(const Duty *duty) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	return CheckRule(duties);
}

bool CheckOffDutyPeriodRule::CheckRule(const Pairing* pairing) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	return CheckRule(pairing->getDutyVec());
}

bool CheckOffDutyPeriodRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
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

	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];

	auto workPeriods = WorkPeriod::GetWorkPeriods(rosters, this->_dbData);
	return CheckRule(workPeriods, crew, checkedStartTime, checkedEndTime);
}

bool CheckOffDutyPeriodRule::CheckRule(const vector<Duty*>& duties) const {
	if (duties.empty()) {
		return true;
	}

	std::string base; // left blank will use the context find pairing id from currDuty or segment
	if (this->IsPairingOptimizerModel()) {
		base = duties.front()->getDepStationRead(); // PO can't get pairing from either currDuty or segments
	}

	bool passAllRule = true;
	for (std::size_t i = 0; i < duties.size(); i++) {
		Duty* currDuty = duties.at(i);
		Duty* nextDuty = (i + 1) >= duties.size() ? nullptr : duties.at(i + 1);
		for (const auto & ruleParam : _ruleParams) {
			_ruleViolation.SetRuleParam(ruleParam);
			bool valid = CheckRule(currDuty, nextDuty, base, ruleParam);
			if (!valid) {
				passAllRule = false;
				ThrowRuleViolation(currDuty);
				if (!this->IsCheckAllRule()) {
					break;
				}
			}
		}
	}
	return passAllRule;
}

bool CheckOffDutyPeriodRule::CheckRule(const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods, const std::shared_ptr<CREW>& crew, const time_t checkedStartTime, const time_t checkedEndTime) const {
	if (workPeriods.empty()) {
		return true;
	}

	bool passAllRule = true;
	for (std::size_t i = 0; i < workPeriods.size(); i++) {
		WorkPeriod* currWorkPeriod = workPeriods[i].get();
		if (currWorkPeriod->GetWorkType() != WorkType::FltDuty) {
			continue;
		}
		WorkPeriod* nextWorkPeriod = (i + 1) >= workPeriods.size() ? nullptr : workPeriods[i + 1].get();
		if (this->IsRosterOptimizerModel() && currWorkPeriod->GetSource() == "PA" && nextWorkPeriod != nullptr && nextWorkPeriod->GetSource() == "PA")
			continue;
		bool valid = CheckRule(currWorkPeriod, nextWorkPeriod, crew, checkedStartTime, checkedEndTime);
		if (!valid) {
			passAllRule = false;
		}
	}
	return passAllRule;
}

bool CheckOffDutyPeriodRule::CheckRule(const WorkPeriod* currWorkPeriod, const WorkPeriod* nextWorkPeriod, const std::shared_ptr<CREW>& crew, const time_t checkedStartTime, const time_t checkedEndTime) const {
	bool passAllRule = true;
	Duty* currDuty = (Duty*)currWorkPeriod->GetWork();

	std::string base{};
	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);

		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}
		
		//针对Split Duty减少相应的FDP时长，在6020中设置
		int dutyFdpMinutes = currDuty->getActualFDP() - currDuty->getDeltaFDPAfterRest();

		std::string direction = DutyUtils::GetDisplacementDirection(*currDuty, _dbData);
		if (ruleParam.MatchDutyAssignments(*currDuty) && ruleParam.MatchDutyTzDiff(*currDuty) &&
			ruleParam.MatchSectorBlhRanges(*currDuty) &&
			ruleParam.MatchAcclimatizedState(currDuty) && ruleParam.MatchHomeBase(*currDuty, base, this->_dbData) &&
			ruleParam.MatchDirection(direction) && ruleParam.MatchFDPThredhold(*currDuty, dutyFdpMinutes)) {

			int minRest = GetDutyMinRest(currDuty, dutyFdpMinutes, direction, ruleParam);
			_ruleViolation.SetParam("minRest", TimeUtils::MinutesTohhmm(minRest));
			bool valid = ruleParam.CheckRule(currDuty, nextWorkPeriod, minRest);
			if (!valid) {
				passAllRule = false;
				ThrowRuleViolation(currDuty);
				if (!this->IsCheckAllRule()) {
					break;
				}
			}
		}
	}
	return passAllRule;
}

bool CheckOffDutyPeriodRule::CheckRule(const Duty *currDuty, const Duty* nextDuty, const std::string& base, const CheckOffDutyPeriodRuleParam& ruleParam) const{
	//针对Split Duty减少相应的FDP时长，在6020中设置
	int dutyFdpMinutes = currDuty->getActualFDP() - currDuty->getDeltaFDPAfterRest();

	std::string direction = DutyUtils::GetDisplacementDirection(*currDuty, _dbData);
	if (ruleParam.MatchDutyAssignments(*currDuty) && ruleParam.MatchDutyTzDiff(*currDuty) &&
		ruleParam.MatchSectorBlhRanges(*currDuty) &&
		ruleParam.MatchAcclimatizedState(currDuty) && ruleParam.MatchHomeBase(*currDuty, base, this->_dbData) &&
		ruleParam.MatchDirection(direction) && ruleParam.MatchFDPThredhold(*currDuty, dutyFdpMinutes)) {

		int minRest = GetDutyMinRest(currDuty, dutyFdpMinutes, direction, ruleParam);
		_ruleViolation.SetParam("minRest", TimeUtils::MinutesTohhmm(minRest));
		if (!ruleParam.CheckRule(currDuty, nextDuty, minRest)) {
			return false;
		}
	}
	return true;
}

int CheckOffDutyPeriodRule::GetDutyMinRest(const Duty* currDuty, const int dutyFdpMinutes, const string& direction, const CheckOffDutyPeriodRuleParam& ruleParam) const {
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

	int minRest = ruleParam._restTimeMinutes + displacementAdjustmentMinutes + fdpAdjustmentMinutes;
	return minRest;
}

int CheckOffDutyPeriodRule::GetDisplacementAdjustment(const Duty* currDuty, const string& direction, const CheckOffDutyPeriodRuleParam& ruleParam) const {
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

int CheckOffDutyPeriodRule::GetFDPAdjustment(const int& dutyFdpMinutes, const CheckOffDutyPeriodRuleParam& ruleParam) const {
	//If the FDP Time is greater than 12:00, then FDP Adjustment = 1.5 * (FDP Time – 12:00)
	//向下取整
	int fdpAdjustmentMinutes = (int)std::floor(ruleParam._fdpTimes * (dutyFdpMinutes - ruleParam._periodThredholdMinutesLower));
	//向上取整 fdpAdjustmentMinutes = std::ceil(ruleParam._fdpTimes * (dutyFdpMinutes - ruleParam._fdpThredholdMinutes));
	//四舍五入 fdpAdjustmentMinutes = std::round(ruleParam._fdpTimes * (dutyFdpMinutes - ruleParam._fdpThredholdMinutes));
		
	return fdpAdjustmentMinutes;
}

int CheckOffDutyPeriodRule::GetDisplacementTime(const Duty& duty) const {
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

void CheckOffDutyPeriodRule::ThrowRuleViolation(const Duty* duty) const {
	string minRest = _ruleViolation.GetParam("minRest");
	string actualRest = _ruleViolation.GetParam("actualRest");
	string actRestStartTimeUtc = _ruleViolation.GetParam("actRestStartTimeUtc");
	string actRestEndTimeUtc = _ruleViolation.GetParam("actRestEndTimeUtc");

	std::string msg = "The actual rest period ({0:actualRest}) is less than the minimum required rest ({1:minrest}).";
	msg = StringUtils::Format(msg, actualRest, minRest);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = CheckOffDutyPeriodRule::RuleFuncId;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, duty->getPairingId());
		rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
	}
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySeq();
	rv->startDTUtc = (time_t)StringUtils::stoll(actRestStartTimeUtc, 0);
	rv->endDTUtc = (time_t)StringUtils::stoll(actRestEndTimeUtc, 0);
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("minRest", minRest));
	rv->operation_result.insert(pair<string, string>("actualRest", actualRest));
	rv->operation_result.insert(pair<string, string>("actRestStartTimeUtc", actRestStartTimeUtc));
	rv->operation_result.insert(pair<string, string>("actRestEndTimeUtc", actRestEndTimeUtc));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckOffDutyPeriodRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckOffDutyPeriodRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CheckOffDutyPeriodRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}