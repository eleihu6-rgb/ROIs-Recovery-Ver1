/**
 * @file LimitMinWorkDaysBetweenAssignmentsForHXRule.cpp
 * @brief 7496法规规则实现类
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-06-05
**/

#include "../RuleSytem.h"
#include "LimitMinWorkDaysBetweenAssignmentsForHXRule.h"
#include "Utility.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/TimeUtils.h"
#include "TimezoneUtils.h"
#include "RuleParams.h"

bool LimitMinWorkDaysBetweenAssignmentsForHXRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;

	time_t checkedStartTime = this->_dbData->scenario.startDtUTC;
	time_t checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;

	checkedStartTime = std::min(checkedStartTime, rosters[0]->actStrUtc);
	checkedEndTime = std::max(checkedEndTime, rosters[rosters.size() - 1]->restStrUtc);

	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string crewBase = crew->getPrimeBase();
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeLocSch(), crewBase, this->GetDataContext());

	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);
		if (!CheckRule(rosters, checkedStartTime, checkedEndTime, crew, offsetTZMinutes, ruleParam)) {
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}

void LimitMinWorkDaysBetweenAssignmentsForHXRule::ParseParam(const InputType& input) {
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(MinWorkDaysBetweenAssignmentsForHXRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

	if (!_ruleParams.empty()) {
		return;
	}

	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(MinWorkDaysBetweenAssignmentsForHXRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

bool LimitMinWorkDaysBetweenAssignmentsForHXRule::CheckRule(const std::vector<const ROSTER*>& rosters, const time_t checkedStartTime, const time_t checkedEndTime, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const MinWorkDaysBetweenAssignmentsForHXRuleParam& ruleParam) const {
	bool passAllRule = true;

	bool isBidirectional = (ruleParam._isDirectional == nullptr || !*ruleParam._isDirectional);

	if (!isBidirectional) {
		// 单向检查：A -> B
		passAllRule = CheckDirectionalRule(rosters, offsetTZMinutes, ruleParam, true);
	}
	else {
		// 双向检查：既检查 A->B，也检查 B->A
		bool passAB = CheckDirectionalRule(rosters, offsetTZMinutes, ruleParam, true);
		bool passBA = CheckDirectionalRule(rosters, offsetTZMinutes, ruleParam, false);
		passAllRule = passAB && passBA;
	}

	return passAllRule;
}

bool LimitMinWorkDaysBetweenAssignmentsForHXRule::CheckDirectionalRule(const std::vector<const ROSTER*>& rosters, const int offsetTZMinutes, const MinWorkDaysBetweenAssignmentsForHXRuleParam& ruleParam, bool isAToB) const {
	bool passAllRule = true;

	int idx = 0;
	while (idx < static_cast<int>(rosters.size())) {
		//查找连续任务A的起始索引和结束索引
		int startIdxA = -1, endIdxA = -1;
		bool isFirstAssignmentA = isAToB;
		endIdxA = GetConsecutiveAssignmentEndIndex(startIdxA, rosters, idx, offsetTZMinutes, ruleParam, isFirstAssignmentA);
		if (startIdxA == -1 || endIdxA == -1) {
			idx++;
			continue;
		}

		//从连续任务A的结束索引后查找连续任务B的开始索引
		int startIdxB = -1, endIdxB = -1;
		bool isSecondAssignmentA = !isAToB;
		startIdxB = GetConsecutiveAssignmentStartIndex(endIdxB, rosters, endIdxA + 1, offsetTZMinutes, ruleParam, isSecondAssignmentA);
		if (startIdxB == -1 || endIdxB == -1) {
			idx = endIdxA + 1;
			continue;
		}

		//计算连续任务A结束日期到连续任务B开始日期之间的工作天数
		int workingDays = CalculateWorkingDays(endIdxA, startIdxB, rosters, offsetTZMinutes, ruleParam);
		if (workingDays < ruleParam._minWorkingDays) {
			if (isAToB) {
				ThrowRuleViolation(rosters[endIdxA], rosters[startIdxB], workingDays, ruleParam, "A_TO_B");
			}
			else {
				ThrowRuleViolation(rosters[endIdxA], rosters[startIdxB], workingDays, ruleParam, "B_TO_A");
			}
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}

		idx = endIdxB + 1;
	}

	return passAllRule;
}

int LimitMinWorkDaysBetweenAssignmentsForHXRule::GetConsecutiveAssignmentEndIndex(int& startIndex, const std::vector<const ROSTER*>& rosters, int startIdx, const int offsetTZMinutes, const MinWorkDaysBetweenAssignmentsForHXRuleParam& ruleParam, bool isAssignmentA) const {
	if (startIdx < 0 || startIdx >= static_cast<int>(rosters.size())) {
		startIndex = -1;
		return -1;
	}

	//找到第一个匹配任务的roster
	startIndex = -1;
	for (int i = startIdx; i < static_cast<int>(rosters.size()); i++) {
		if (isAssignmentA ? ruleParam.MatchConsecutiveAssignmentA(rosters[i]) : ruleParam.MatchConsecutiveAssignmentB(rosters[i])) {
			startIndex = i;
			break;
		}
	}

	if (startIndex == -1) {
		return -1;
	}

	int endIndex = startIndex;
	ROSTER* prevRoster = nullptr;
	for (int i = startIndex; i < static_cast<int>(rosters.size()); i++) {
		ROSTER* currRoster = const_cast<ROSTER*>(rosters[i]);
		if (!(isAssignmentA ? ruleParam.MatchConsecutiveAssignmentA(rosters[i]) : ruleParam.MatchConsecutiveAssignmentB(rosters[i]))) {
			break;
		}
		endIndex = i;
		int consecutiveDays = RosterUtils::GetConsecutiveDaysWithCurrRoster(prevRoster, currRoster);

		if (consecutiveDays < 0) {
			if (i > startIndex) {
				return i - 1;
			}
			return -1;
		}
		prevRoster = currRoster;
	}

	return endIndex;
}

int LimitMinWorkDaysBetweenAssignmentsForHXRule::GetConsecutiveAssignmentStartIndex(int& endIndex, const std::vector<const ROSTER*>& rosters, int startIdx, const int offsetTZMinutes, const MinWorkDaysBetweenAssignmentsForHXRuleParam& ruleParam, bool isAssignmentA) const {
	if (startIdx < 0 || startIdx >= static_cast<int>(rosters.size())) {
		endIndex = -1;
		return -1;
	}

	//找到第一个匹配任务的roster
	int startIdxFound = -1;
	for (int i = startIdx; i < static_cast<int>(rosters.size()); i++) {
		if (isAssignmentA ? ruleParam.MatchConsecutiveAssignmentA(rosters[i]) : ruleParam.MatchConsecutiveAssignmentB(rosters[i])) {
			startIdxFound = i;
			break;
		}
	}

	if (startIdxFound == -1) {
		endIndex = -1;
		return -1;
	}

	endIndex = startIdxFound;
	ROSTER* prevRoster = nullptr;
	for (int i = startIdxFound; i < static_cast<int>(rosters.size()); i++) {
		ROSTER* currRoster = const_cast<ROSTER*>(rosters[i]);
		if (!(isAssignmentA ? ruleParam.MatchConsecutiveAssignmentA(rosters[i]) : ruleParam.MatchConsecutiveAssignmentB(rosters[i]))) {
			break;
		}
		endIndex = i;
		int consecutiveDays = RosterUtils::GetConsecutiveDaysWithCurrRoster(prevRoster, currRoster);

		if (consecutiveDays < 0) {
			if (i > startIdxFound) {
				endIndex = i - 1;
			}
			else {
				endIndex = -1;
				startIdxFound = -1;
			}
			return startIdxFound;
		}
		prevRoster = currRoster;
	}

	return startIdxFound;
}

int LimitMinWorkDaysBetweenAssignmentsForHXRule::CalculateWorkingDays(int startIdx, int endIdx, const std::vector<const ROSTER*>& rosters, const int offsetTZMinutes, const MinWorkDaysBetweenAssignmentsForHXRuleParam& ruleParam) const {
	if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
		return 0;
	}

	bool isCountBlankDay = (ruleParam._isCountBlankDay != nullptr && *ruleParam._isCountBlankDay);

	//获取任务A结束日期和任务B开始日期（使用本地日期的开始时间）
	time_t endDayLocA = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[startIdx]->actStrUtc, offsetTZMinutes);
	time_t startDayLocB = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[endIdx]->actStrUtc, offsetTZMinutes);

	//计算总天数差
	int totalDays = static_cast<int>((startDayLocB - endDayLocA) / (24 * 3600));
	if (totalDays <= 1) {
		return 0; //任务A结束日期和任务B开始日期之间没有足够的天数
	}

	int workingDays = 0;
	time_t currentCheckDay = endDayLocA + 24 * 3600; //从任务A结束日期的下一天开始

	//遍历所有中间天数
	for (int day = 1; day < totalDays; day++) {
		bool hasWorkingAssignment = false;
		bool isBlankDay = true;//是否空白天，默认空白天
		//检查当前天是否有工作任务（考虑跨天情况）
		for (int i = startIdx + 1; i <= endIdx - 1; i++) {
			const ROSTER* currRoster = rosters[i];
			
			//获取任务的开始日期和结束日期（本地时间的开始）
			time_t rosterStartDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(currRoster->actStrUtc, offsetTZMinutes);
			time_t rosterEndDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(currRoster->restStrUtc, offsetTZMinutes);

			//检查当前检查日期是否在任务的日期范围内（考虑跨天）
			//任务覆盖的日期范围是 [rosterStartDay, rosterEndDay]
			if (currentCheckDay >= rosterStartDay && currentCheckDay <= rosterEndDay) {
				isBlankDay = false;
				if (ruleParam.MatchWorkingAssignment(currRoster)) {
					hasWorkingAssignment = true;
					break; //找到一个匹配的工作任务即可
				}
			}
		}

		//判断是否计数为工作天
		if (hasWorkingAssignment) {
			workingDays++;
		}
		else if (isCountBlankDay && isBlankDay) {
			//如果是空白天并且需要计算，则计数
			workingDays++;
		}
		else {
			break;
		}

		currentCheckDay += 24 * 3600;
	}

	return workingDays;
}

void LimitMinWorkDaysBetweenAssignmentsForHXRule::ThrowRuleViolation(const ROSTER* rosterA, const ROSTER* rosterB, const int actualWorkingDays, const MinWorkDaysBetweenAssignmentsForHXRuleParam& ruleParam, const std::string& direction) const {

	string assignmentA;
	if (!ruleParam._strConsecutiveAssignmentA.empty() && ruleParam._strConsecutiveAssignmentA != "*" 
		&& !ruleParam._strConsecutiveAssignmentGroupA.empty() && ruleParam._strConsecutiveAssignmentGroupA != "*") {
		assignmentA = ruleParam._strConsecutiveAssignmentGroupA + "/" + ruleParam._strConsecutiveAssignmentA;
	}
	else if (!ruleParam._strConsecutiveAssignmentA.empty() && ruleParam._strConsecutiveAssignmentA != "*") {
		assignmentA = ruleParam._strConsecutiveAssignmentA;
	}
	else if (!ruleParam._strConsecutiveAssignmentGroupA.empty() && ruleParam._strConsecutiveAssignmentGroupA != "*") {
		assignmentA = ruleParam._strConsecutiveAssignmentGroupA;
	}
	else {
		assignmentA = ruleParam._strConsecutiveAssignmentGroupA + "/" + ruleParam._strConsecutiveAssignmentA;
	}

	string assignmentB;
	if (!ruleParam._strConsecutiveAssignmentB.empty() && ruleParam._strConsecutiveAssignmentB != "*"
		&& !ruleParam._strConsecutiveAssignmentGroupB.empty() && ruleParam._strConsecutiveAssignmentGroupB != "*") {
		assignmentB = ruleParam._strConsecutiveAssignmentGroupB + "/" + ruleParam._strConsecutiveAssignmentB;
	}
	else if (!ruleParam._strConsecutiveAssignmentB.empty() && ruleParam._strConsecutiveAssignmentB != "*") {
		assignmentB = ruleParam._strConsecutiveAssignmentB;
	}
	else if (!ruleParam._strConsecutiveAssignmentGroupB.empty() && ruleParam._strConsecutiveAssignmentGroupB != "*") {
		assignmentB = ruleParam._strConsecutiveAssignmentGroupB;
	}
	else {
		assignmentB = ruleParam._strConsecutiveAssignmentGroupB + "/" + ruleParam._strConsecutiveAssignmentB;
	}

	std::string msg = "Working days between two assignments ({0:assignmentA}) ({1:assignmentB}) less than minimum {2:minWorkingDays} days.({3:direction})";
	msg = StringUtils::Format(msg, assignmentA, assignmentB, ruleParam._minWorkingDays, direction);

	SharedPtr<CREW> ppCrew = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex];
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = ppCrew->idCrew;
	rv->rosterId = rosterA->rosterId;
	rv->pairingId = (rosterA->pairing != nullptr) ? rosterA->pairId : 0;
	rv->startDTUtc = rosterA->actRestStrUtc;
	rv->endDTUtc = rosterB->actStrUtc;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(std::pair<std::string, std::string>("minWorkingDays", std::to_string(ruleParam._minWorkingDays)));
	rv->operation_result.insert(std::pair<std::string, std::string>("actualWorkingDays", std::to_string(actualWorkingDays)));
	rv->operation_result.insert(std::pair<std::string, std::string>("direction", direction));
	_ruleViolation.AddRuleViolations(rv);
}