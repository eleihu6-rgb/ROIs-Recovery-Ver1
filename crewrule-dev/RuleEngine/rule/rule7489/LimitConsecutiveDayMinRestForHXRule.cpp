/**
 * @file LimitConsecutiveDayMinRestForHXRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-02-13
**/

#include "../RuleSytem.h"
#include "LimitConsecutiveDayMinRestForHXRule.h"
#include "Utility.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"

bool LimitConsecutiveDayMinRestForHXRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;
	if (rosters.empty()) {
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
	string crewBase = crew->getPrimeBase();
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeLocSch(), crewBase, this->GetDataContext());
	string weekdayStartFrom = this->_dbData->getWeekdayStartFrom();

	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);

		auto workPeriods = WorkPeriod::GetWorkPeriods2(rosters, ruleParam._restAssignmentGroups, this->_dbData);
		bool valid = CheckRule(workPeriods, checkedStartTime, checkedEndTime, weekdayStartFrom, crew, offsetTZMinutes, ruleParam);
		if (!valid) {
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}


bool LimitConsecutiveDayMinRestForHXRule::CheckRule(const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods, const time_t checkedStartTime, const time_t checkedEndTime, const string& weekdayStartFrom, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const LimitConsecutiveDayMinRestForHXRuleParam& ruleParam) const {
	bool valid = true;

	vector<ROSTER*> possibleViolatedlayoverRosters;
	//获得可能违规Layover Assignments任务列表
	if (ruleParam.IsCheckLayoverAssignment()) {
		possibleViolatedlayoverRosters = GetPossibleViolatedLayoverRosters(crew, ruleParam);
	}

	map<time_t, time_t>& mpRange = Utility::GetInstancePtr()->getDateRangeFromLong("CD", std::to_string(ruleParam._consecutiveDays), checkedStartTime, checkedEndTime, weekdayStartFrom, offsetTZMinutes);
	for (auto& range : mpRange) {
		time_t rangeStartTimeUtc = range.first;
		time_t rangeEndTimeUtc = range.second; 
		if (!CheckRule(workPeriods, possibleViolatedlayoverRosters, rangeStartTimeUtc, rangeEndTimeUtc, crew, offsetTZMinutes, ruleParam)) {
			valid = false;
		}
	}
	return valid;
}

void LimitConsecutiveDayMinRestForHXRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitConsecutiveDayMinRestForHXRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitConsecutiveDayMinRestForHXRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

bool LimitConsecutiveDayMinRestForHXRule::CheckRule(const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods, const vector<ROSTER*>& possibleViolatedlayoverRosters, const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const LimitConsecutiveDayMinRestForHXRuleParam& ruleParam) const {
	bool valid = true;

	int restTimes = 0; //休息次数
	int consecutiveRestTimes = 0; //连续休息次数
	int violatedLayoverRosterTimes = 0; //违规的Layover Assignment次数
	GetRestTimes(restTimes, consecutiveRestTimes, violatedLayoverRosterTimes, workPeriods, possibleViolatedlayoverRosters, rangeStartTimeUtc, rangeEndTimeUtc, crew, offsetTZMinutes, ruleParam);
	if (restTimes == -1 || consecutiveRestTimes == -1) {
		return true;//不满足检查要求，不进行检查
	}

	//检查连续N个休息时长合规性
	if (ruleParam._maxConsecutiveRestTimes != nullptr && *(ruleParam._maxConsecutiveRestTimes) < consecutiveRestTimes) {
		valid = false;
		ThrowRuleViolationForConsecutiveRestTimes(rangeStartTimeUtc, rangeEndTimeUtc, consecutiveRestTimes, ruleParam);
	}

	//检查N个休息时长合规性
	if (ruleParam._maxTotalRestTimes != nullptr && *(ruleParam._maxTotalRestTimes) < restTimes) {
		valid = false;
		ThrowRuleViolationForRestTimes(rangeStartTimeUtc, rangeEndTimeUtc, restTimes, ruleParam);
		
	}

	//检查Layover Assignment时长是否满足最低要求
	//条件：连续14天如有连续3个Rest Duration或总数4个Rest Duration，并且Layover内有EXB任务，那么EXB的时长至少34:00
	if (violatedLayoverRosterTimes > 0) {
		valid = false;
		ThrowRuleViolationForLayoverAssignmentDuration(rangeStartTimeUtc, rangeEndTimeUtc, violatedLayoverRosterTimes, ruleParam);
	}
		
	return valid;
}

void LimitConsecutiveDayMinRestForHXRule::GetRestTimes(int& restTimes, int& consecutiveRestTimes, int& violatedLayoverRosterTimes, const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods, const vector<ROSTER*>& possibleViolatedlayoverRosters, const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const LimitConsecutiveDayMinRestForHXRuleParam& ruleParam) const {
	WorkPeriod* beforeWorkPeriod = nullptr;//前一个任务
	int restOffsetTZMinutes = offsetTZMinutes; //Rest时区

	for (size_t i = 0; i < workPeriods.size(); i++) {
		WorkPeriod* currWorkPeriod = workPeriods[i].get();

		if (currWorkPeriod == nullptr || currWorkPeriod->GetEndTimeUTC() < rangeStartTimeUtc) {
			beforeWorkPeriod = currWorkPeriod;
			continue;
		}

		if (typeid(*currWorkPeriod->GetWork()) == typeid(Duty)) {
			Duty* duty = (Duty*)currWorkPeriod->GetWork();
			if (duty->getAcclimatisedState() != ruleParam._accState) {
				restTimes = -1;
				consecutiveRestTimes = -1;
				return;
			}
			if (duty->getMinRestTimeZone() != -1 ) {
				restOffsetTZMinutes = duty->getMinRestTimeZone();
			}
		}

		time_t actRestStartTimeUtc = 0, actRestEndTimeUtc = 0;
		RosterUtils::GetActualRestMinutes(actRestStartTimeUtc, actRestEndTimeUtc, beforeWorkPeriod == nullptr ? nullptr : beforeWorkPeriod->GetWork(), currWorkPeriod->GetWork(), _dbData);
		actRestStartTimeUtc = std::max(rangeStartTimeUtc, actRestStartTimeUtc);
		actRestEndTimeUtc = std::min(rangeEndTimeUtc, actRestEndTimeUtc);

		GetRestTimes(restTimes, consecutiveRestTimes, actRestStartTimeUtc, actRestEndTimeUtc, restOffsetTZMinutes, ruleParam);

		//最后一个WorkPeriod
		if (i == workPeriods.size() - 1) {
			RosterUtils::GetActualRestMinutes(actRestStartTimeUtc, actRestEndTimeUtc, currWorkPeriod->GetWork(), nullptr, _dbData);
			actRestStartTimeUtc = std::max(rangeStartTimeUtc, actRestStartTimeUtc);
			actRestEndTimeUtc = std::min(rangeEndTimeUtc, actRestEndTimeUtc);

			GetRestTimes(restTimes, consecutiveRestTimes, actRestStartTimeUtc, actRestEndTimeUtc, restOffsetTZMinutes, ruleParam);
		}

		//获得Layover Assignment Time
		if (!possibleViolatedlayoverRosters.empty()) {
			violatedLayoverRosterTimes = GetViolatedLayoverRosterTimes(beforeWorkPeriod, currWorkPeriod, possibleViolatedlayoverRosters, rangeStartTimeUtc, rangeEndTimeUtc, ruleParam);
		}

		beforeWorkPeriod = currWorkPeriod;
		if (currWorkPeriod->GetStartTimeUTC() > rangeEndTimeUtc) {
			break;
		}
	}
}

vector<ROSTER*> LimitConsecutiveDayMinRestForHXRule::GetPossibleViolatedLayoverRosters(const std::shared_ptr<CREW>& crew, const LimitConsecutiveDayMinRestForHXRuleParam& ruleParam) const {
	vector<ROSTER*> results;
	for (auto& roster : crew->rosterList) {
		if (roster == nullptr) {
			continue;
		}

		//获得Layover Assignment类型的ground roster，并且时长小于minLayoverAssignmentsDuration（可能违规的任务）
		//Ground roster的pairing为nullptr，且assignment匹配配置的任务类型（如EXB）
		if (roster->pairing == nullptr) {
			if (std::find(ruleParam._layoverAssignments.begin(), ruleParam._layoverAssignments.end(), roster->qualifier) != ruleParam._layoverAssignments.end()) {
				int durationMinutes = static_cast<int>((roster->actRestStrUtc - roster->actStrUtc) / 60);
				if (durationMinutes < ruleParam._minLayoverAssignmentsDuration) {
					results.emplace_back(roster.get());
				}
			}
		}
	}
	return results;
}

int LimitConsecutiveDayMinRestForHXRule::GetViolatedLayoverRosterTimes(const WorkPeriod* beforeWorkPeriod, const WorkPeriod* currWorkPeriod, const vector<ROSTER*>& layoverRosters, const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const LimitConsecutiveDayMinRestForHXRuleParam& ruleParam) const {
	int violatedLayoverRosterTimes = 0;
	if (beforeWorkPeriod == nullptr || currWorkPeriod == nullptr) {
		return 0;
	}
	//Duty Layover是同一个Pairing二个Duty之间的休息，仅统计在Layover中间的才算违规
	if (typeid(*beforeWorkPeriod->GetWork()) == typeid(Duty) && typeid(*currWorkPeriod->GetWork()) == typeid(Duty)) {
		Duty* beforeDuty = (Duty*)beforeWorkPeriod->GetWork();
		Duty* currDuty = (Duty*)currWorkPeriod->GetWork();
		if (beforeDuty->getPairingId() == currDuty->getPairingId()) {
			time_t layoverStartTime = beforeDuty->getLastDropoff()->getEndUtc();
			time_t layoverEndTime = currDuty->getFirstPickup()->getStartUtc();
			for (size_t i = 0; i < layoverRosters.size(); i++) {
				auto layoverRoster = layoverRosters[i];
				time_t layoverRosterStartTime = layoverRoster->getStartTimeUtcAct();
				time_t layoverRosterEndTime = layoverRoster->getRestStartUtcAct();

				if (layoverRosterStartTime >= rangeStartTimeUtc && layoverRosterStartTime <= rangeEndTimeUtc
					&& layoverRosterEndTime >= rangeStartTimeUtc && layoverRosterEndTime <= rangeEndTimeUtc) {
					continue;
				}

				if (layoverRosterStartTime >= layoverStartTime && layoverRosterStartTime <= layoverEndTime
					&& layoverRosterEndTime >= layoverStartTime && layoverRosterEndTime <= layoverEndTime) {
					violatedLayoverRosterTimes++;
				}
			}
		}
	}
	return violatedLayoverRosterTimes;
}

void LimitConsecutiveDayMinRestForHXRule::GetRestTimes(int& restTimes, int& consecutiveRestTimes, const time_t actRestStartTimeUtc, const time_t actRestEndTimeUtc, const int restOffsetTZMinutes, const LimitConsecutiveDayMinRestForHXRuleParam& ruleParam) const {
	int actRestMinutes = (int)(actRestEndTimeUtc - actRestStartTimeUtc) / 60;
	if (actRestMinutes >= ruleParam._restDurationRangeMinutesLower && actRestMinutes <= ruleParam._restDurationRangeMinutesUpper) {
		if (ruleParam._isPhysiologicalRest != nullptr && *ruleParam._isPhysiologicalRest) {
			int localNightNum = DutyUtils::GetLocalNightNums(actRestStartTimeUtc, actRestEndTimeUtc, restOffsetTZMinutes);
			if (localNightNum > 0) {
				//满足休息条件
				restTimes++;
				consecutiveRestTimes++;
			}
			else {
				consecutiveRestTimes = 0;
			}
		}
		else {
			//满足休息条件
			restTimes++;
			consecutiveRestTimes++;
		}
	}
	else {
		consecutiveRestTimes = 0;
	}
}

void LimitConsecutiveDayMinRestForHXRule::ThrowRuleViolationForRestTimes(const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const int restTimes, const LimitConsecutiveDayMinRestForHXRuleParam& ruleParam) const {
	//在任意连续的 {2:consecutiveDays} 天中，休息的次数（{0:consecutiveRestTimes}）超过了休息的最大次数（{1:maxConsecutiveRestTimes}）。
	string msg = "The number of consecutive rest periods ({0:consecutiveRestTimes}) exceeds the maximum number of consecutive rest periods ({1:maxTotalRestTimes}) within any {2:consecutiveDays} consecutive days.";
	msg = StringUtils::Format(msg, restTimes, *ruleParam._maxTotalRestTimes, ruleParam._consecutiveDays);

	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->startDTUtc = rangeStartTimeUtc;
	rv->endDTUtc = rangeEndTimeUtc;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("restTimes", std::to_string(restTimes)));
	rv->operation_result.insert(pair<string, string>("maxTotalRestTimes", std::to_string(*ruleParam._maxTotalRestTimes)));
	rv->operation_result.insert(pair<string, string>("consecutiveDays", std::to_string((ruleParam._consecutiveDays))));

	_ruleViolation.AddRuleViolations(rv);
}

void LimitConsecutiveDayMinRestForHXRule::ThrowRuleViolationForConsecutiveRestTimes(const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const int consecutiveRestTimes, const LimitConsecutiveDayMinRestForHXRuleParam& ruleParam) const {
	//在任意连续的 {2:consecutiveDays} 天中，连续休息的次数（{0:consecutiveRestTimes}）超过了连续休息的最大次数（{1:maxConsecutiveRestTimes}）。
	string msg = "The number of consecutive rest periods ({0:consecutiveRestTimes}) exceeds the maximum number of consecutive rest periods ({1:maxConsecutiveRestTimes}) within any {2:consecutiveDays} consecutive days.";
	msg = StringUtils::Format(msg, consecutiveRestTimes, *ruleParam._maxConsecutiveRestTimes, ruleParam._consecutiveDays);

	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->startDTUtc = rangeStartTimeUtc;
	rv->endDTUtc = rangeEndTimeUtc;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("consecutiveRestTimes", std::to_string(consecutiveRestTimes)));
	rv->operation_result.insert(pair<string, string>("maxConsecutiveRestTimes", std::to_string(*ruleParam._maxConsecutiveRestTimes)));
	rv->operation_result.insert(pair<string, string>("consecutiveDays", std::to_string((ruleParam._consecutiveDays))));

	_ruleViolation.AddRuleViolations(rv);
}

void LimitConsecutiveDayMinRestForHXRule::ThrowRuleViolationForLayoverAssignmentDuration(const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const int violatedLayoverRosterTimes, const LimitConsecutiveDayMinRestForHXRuleParam& ruleParam) const {
	//在Duty Layover安排的任务({0:layoverAssignments})至少需要时长 {0:minLayoverAssignmentsDuration}).
	string msg = "The Layover Assignment ({0:layoverAssignments}) is less than the minimum required duration ({1:minDuration}) within any {2:consecutiveDays} consecutive days.";
	msg = StringUtils::Format(msg, ruleParam._strLayoverAssignments, ruleParam._strMinLayoverAssignmentsDuration, ruleParam._consecutiveDays);

	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->startDTUtc = rangeStartTimeUtc;
	rv->endDTUtc = rangeEndTimeUtc;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("minLayoverAssignmentsDuration", ruleParam._strMinLayoverAssignmentsDuration));
	rv->operation_result.insert(pair<string, string>("layoverAssignments", ruleParam._strLayoverAssignments));
	rv->operation_result.insert(pair<string, string>("consecutiveDays", std::to_string((ruleParam._consecutiveDays))));
	rv->operation_result.insert(pair<string, string>("violatedLayoverAssignmentTimes", std::to_string(violatedLayoverRosterTimes)));
	_ruleViolation.AddRuleViolations(rv);
}
