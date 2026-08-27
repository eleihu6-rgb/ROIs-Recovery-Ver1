/**
 * @file CheckEarnedDaysOffForPRRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-08-21
**/

#include "../RuleSytem.h"
#include "CheckEarnedDaysOffForPRRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "index/CrewRpRecencyIndex.h"

inline static time_t GetEndTimeUtcAct(const Activity* activity) {
	if (typeid(*activity) == typeid(ROSTER)) {
		return ((ROSTER*)activity)->getRestStartUtcAct();
	}
	return activity->getEndTimeUtcAct();
}

inline static time_t GetEndTimeLocAct(const Activity* activity) {
	if (typeid(*activity) == typeid(ROSTER)) {
		return ((ROSTER*)activity)->getRestStartLocAct();
	}
	return activity->getEndTimeLocAct();
}


bool CheckEarnedDaysOffForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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

	for (const auto & ruleParam : _ruleParams) {
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}
		_ruleViolation.SetRuleParam(ruleParam);

		bool valid = CheckRule(rosters, crew, offsetTZMinutes, ruleParam);
		if (!valid) {
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}


bool CheckEarnedDaysOffForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const CheckEarnedDaysOffForPRRuleParam& ruleParam) const {
	bool passAllRule = true;
	auto activityPeriods = GetActivityPeriods(rosters, ruleParam);
	int totalConsecutiveWorkingDays = 0;//合计连续工作天数
	bool isRecalcConsecutiveDays = true;//是否重新计算连续天（从第一天开始）
	for (size_t currentIndex = 0; currentIndex < activityPeriods.size(); currentIndex++) {
		shared_ptr<ActivityPeriod>& currActivityPeriod = activityPeriods[currentIndex];
		shared_ptr<ActivityPeriod> nextActivityPeriod = ((currentIndex + 1) == activityPeriods.size()) ? nullptr : activityPeriods[currentIndex+1];

		if (!currActivityPeriod->isCheckWorkingTask) {
			continue;
		}

		if (isRecalcConsecutiveDays) {
			int consecutiveWorkingDays = RosterUtils::GetConsecutiveDaysWithCurrActivity(nullptr, currActivityPeriod->activity);
			totalConsecutiveWorkingDays += consecutiveWorkingDays;
			isRecalcConsecutiveDays = false;
		}

		if (nextActivityPeriod != nullptr && nextActivityPeriod->isCheckWorkingTask) {
			int consecutiveWorkingDays = RosterUtils::GetConsecutiveDaysWithCurrActivity(currActivityPeriod->activity, nextActivityPeriod == nullptr ? nullptr : nextActivityPeriod->activity);
			if (consecutiveWorkingDays >= 0) {
				totalConsecutiveWorkingDays += consecutiveWorkingDays;
				continue;
			}
		}

		//不连续天工作任务，检查连续天数是否满足。若不满足则进行法规检查，则忽略本次检查，进入下一个连续天检查
		if (!ruleParam.MatchConsecutiveWorkingDays(totalConsecutiveWorkingDays)) {
			totalConsecutiveWorkingDays = 0;//进入下一个连续天判断
			isRecalcConsecutiveDays = true;
			continue;
		}

		if (currentIndex == activityPeriods.size() - 1 && !ruleParam._isBlankDayCountedAsDO) {
			//场景的最后一个任务若是工作任务，若空白天不计入休息，则最后一个工作任务一定告警
			if (totalConsecutiveWorkingDays <= 0) {
				totalConsecutiveWorkingDays = RosterUtils::GetConsecutiveDaysWithCurrActivity(nullptr, currActivityPeriod->activity);
			}
			
			int restOffsetTZMinutes = (int)(GetEndTimeLocAct(currActivityPeriod->activity) - GetEndTimeUtcAct(currActivityPeriod->activity)) / 60;
			time_t restStartTimeUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(GetEndTimeUtcAct(currActivityPeriod->activity), restOffsetTZMinutes) + (time_t)24 * 60 * 60;

			ThrowRuleViolation(currActivityPeriod, totalConsecutiveWorkingDays, restStartTimeUtc, restStartTimeUtc, ruleParam);
			passAllRule = false;
			break;
		}

		if (!CheckRule(currentIndex, currActivityPeriod, totalConsecutiveWorkingDays, activityPeriods, ruleParam)) {
			passAllRule = false;
		}
		isRecalcConsecutiveDays = true;
		totalConsecutiveWorkingDays = 0;
	}
	return passAllRule;
}

bool CheckEarnedDaysOffForPRRule::CheckRule(size_t& currentIndex, const shared_ptr<ActivityPeriod>& currActivityPeriod, const int totalConsecutiveWorkingDays, const vector<shared_ptr<ActivityPeriod>>& activityPeriods, const CheckEarnedDaysOffForPRRuleParam& ruleParam) const {
	bool passAllRule = true;

	//获得休息开始时间，从工作任务结束的第二天0点开始
	int restOffsetTZMinutes = (int)(GetEndTimeLocAct(currActivityPeriod->activity) - GetEndTimeUtcAct(currActivityPeriod->activity)) / 60;
	time_t restStartTimeUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(GetEndTimeUtcAct(currActivityPeriod->activity), restOffsetTZMinutes) + (time_t)24 * 60 * 60;

	//检查后续activityPeriod是不是休息
	bool isSubFirstRest = true;
	shared_ptr<ActivityPeriod> subPrevRestActivityPeriod = nullptr;

	for (size_t subIndex = currentIndex + 1; subIndex < activityPeriods.size(); subIndex++) {
		auto& subCurrActivityPeriod = activityPeriods[subIndex];//activityPeriods子集合[currentIndex+1, activityPeriods.size()-1]

		if (ruleParam._isBlankDayCountedAsDO) { //空白天计入休息
			if (subCurrActivityPeriod->isRest) {
				currentIndex = subIndex; //currActivityPeriod跳过中间的休息，因为当前subCurrActivityPeriod是休息，开始从subCurrActivityPeriod的索引位置下一个开始检查（因为for循环后面有i++，因此最终i=j+1）。
				continue;
			}
			//获得休息结束时间（subCurrActivityPeriod为后续的非休息任务）
			time_t restEndTimeUtc = subCurrActivityPeriod->activity->getStartTimeUtcAct();
			if (restStartTimeUtc > restEndTimeUtc) {
				restEndTimeUtc = restStartTimeUtc;
			}
			if (!CheckRule(totalConsecutiveWorkingDays, restStartTimeUtc, restEndTimeUtc, ruleParam)) {
				ThrowRuleViolation(currActivityPeriod, totalConsecutiveWorkingDays, restStartTimeUtc, restEndTimeUtc, ruleParam);
				passAllRule = false;
			}
			break;
		}
		else { //空白天不计入休息
			if (subCurrActivityPeriod->isRest) {
				currentIndex = subIndex;//currActivityPeriod跳过中间的休息，因为当前subCurrActivityPeriod是休息，开始从subCurrActivityPeriod的索引位置下一个开始检查（因为for循环后面有i++，因此最终i=j+1）。

				if (subPrevRestActivityPeriod == nullptr && !isSameDays(currActivityPeriod, subCurrActivityPeriod)) {
					//中间的空白天作为工作日，因此休息结束时间等于休息开始时间(即无休息)
					time_t restEndTimeUtc = restStartTimeUtc;
					if (!CheckRule(totalConsecutiveWorkingDays, restStartTimeUtc, restEndTimeUtc, ruleParam)) {
						ThrowRuleViolation(currActivityPeriod, totalConsecutiveWorkingDays, restStartTimeUtc, restEndTimeUtc, ruleParam);
						passAllRule = false;
					}
					break;
				}

				//判断当前休息任务与前一个休息任务是否连续天，若连续天则继续找下一个任务；若不是连续天，则进行检查
				if (subPrevRestActivityPeriod != nullptr && !isConsecutiveDays(subPrevRestActivityPeriod, subCurrActivityPeriod)) {
					//获得休息结束时间（subPrevRestActivityPeriod为子集中前一个休息任务）
					time_t restEndTimeUtc = GetEndTimeUtcAct(subPrevRestActivityPeriod->activity);
					if (restStartTimeUtc > restEndTimeUtc) {
						restEndTimeUtc = restStartTimeUtc;
					}

					if (!CheckRule(totalConsecutiveWorkingDays, restStartTimeUtc, restEndTimeUtc, ruleParam)) {
						ThrowRuleViolation(currActivityPeriod, totalConsecutiveWorkingDays, restStartTimeUtc, restEndTimeUtc, ruleParam);
						passAllRule = false;
					}
					//currentIndex = subIndex; //currActivityPeriod跳过中间的休息，因为当前subCurrActivityPeriod是休息，开始从subCurrActivityPeriod的索引位置下一个开始检查（因为for循环后面有i++，因此最终i=j+1）。
					break;
				}

				subPrevRestActivityPeriod = subCurrActivityPeriod;
			}
			else {
				time_t restEndTimeUtc = 0;
				if (subPrevRestActivityPeriod == nullptr) { //工作任务（subCurrActivityPeriod）随后任务，即为非工作任务
					if (isSameDays(currActivityPeriod, subCurrActivityPeriod)) {
						//获得休息结束时间（subCurrActivityPeriod为后续的非休息任务, 并且与currActivityPeriod在同一天）
						restEndTimeUtc = subCurrActivityPeriod->activity->getStartTimeUtcAct();
					}
					else {
						restEndTimeUtc = restStartTimeUtc;
					}
				}
				else {
					restEndTimeUtc = GetEndTimeUtcAct(subPrevRestActivityPeriod->activity);
				}
				if (restStartTimeUtc > restEndTimeUtc) {
					restEndTimeUtc = restStartTimeUtc;
				}

				if (!CheckRule(totalConsecutiveWorkingDays, restStartTimeUtc, restEndTimeUtc, ruleParam)) {
					ThrowRuleViolation(currActivityPeriod, totalConsecutiveWorkingDays, restStartTimeUtc, restEndTimeUtc, ruleParam);
					passAllRule = false;
				}
				break;
			}
		}

		////若不是休息，则退出
		//if (!subCurrActivityPeriod->isRest) {
		//	currentIndex = subIndex - 1;//currActivityPeriod跳过中间的休息，因为当前subCurrActivityPeriod不是休息，开始从subCurrActivityPeriod的索引位置开始检查（因为for循环后面有i++，因此最终i=j）。
		//	break;
		//}
	}
	return passAllRule;

}

bool CheckEarnedDaysOffForPRRule::CheckRule(const int consecutiveWorkingDays, const time_t restStartTimeUtc, const time_t restEndTimeUtc, const CheckEarnedDaysOffForPRRuleParam& ruleParam) const {
	int requiredRestHours = 0;//需要休息的小时数
	if (ruleParam._fixedRequiredDO != nullptr) {
		requiredRestHours = (int)std::ceil(*ruleParam._fixedRequiredDO * 24);
	}
	else if (ruleParam._percentRequiredDO != nullptr) {
		requiredRestHours = (int)std::ceil(consecutiveWorkingDays * (*ruleParam._percentRequiredDO / 100) * 24);
	}
	int actRestHours = (restStartTimeUtc >= restEndTimeUtc) ?  0 : (int)((restEndTimeUtc - restStartTimeUtc) / 3600);
	return actRestHours >= requiredRestHours;
}

vector<shared_ptr<ActivityPeriod>> CheckEarnedDaysOffForPRRule::GetActivityPeriods(const std::vector<const ROSTER*>& rosters, const CheckEarnedDaysOffForPRRuleParam& ruleParam) const {
	vector<shared_ptr<ActivityPeriod>> activityPeriods;

	if (ruleParam._workingLevel == "P") { 	//基于Pairing检查
		for (auto& roster : rosters) {
			
			if (roster->pairing == nullptr) {
				shared_ptr<ActivityPeriod> activityPeriod = GetActivityPeriodWithWorking(roster, ruleParam);
				activityPeriod->roster = const_cast<ROSTER*>(roster);
				activityPeriods.emplace_back(activityPeriod);
			}
			else {
				shared_ptr<ActivityPeriod> activityPeriod = GetActivityPeriodWithWorking(roster->pairing, ruleParam);
				activityPeriod->roster = const_cast<ROSTER*>(roster);
				activityPeriods.emplace_back(activityPeriod);
			}
		}
	}
	else if (ruleParam._workingLevel == "D") { 	//基于Duty检查
		for (auto& roster : rosters) {
			if (roster->pairing == nullptr) {
				shared_ptr<ActivityPeriod> activityPeriod = GetActivityPeriodWithWorking(roster, ruleParam);
				activityPeriod->roster = const_cast<ROSTER*>(roster);
				activityPeriods.emplace_back(activityPeriod);
			}
			else {
				auto& duties = roster->pairing->getDutyVec();
				for (auto& duty : duties) {
					shared_ptr<ActivityPeriod> activityPeriod = GetActivityPeriodWithWorking(duty, ruleParam);
					activityPeriod->roster = const_cast<ROSTER*>(roster);
					activityPeriods.emplace_back(activityPeriod);
				}
			}
		}
	}
	else if (ruleParam._workingLevel == "S") { 	//基于Segment检查
		for (auto& roster : rosters) {
			if (roster->pairing == nullptr) {
				shared_ptr<ActivityPeriod> activityPeriod = GetActivityPeriodWithWorking(roster, ruleParam);
				activityPeriod->roster = const_cast<ROSTER*>(roster);
				activityPeriods.emplace_back(activityPeriod);
			}
			else {
				auto& duties = roster->pairing->getDutyVec();
				for (auto& duty : duties) {
					for (auto& segment : duty->getSegments()) {
						shared_ptr<ActivityPeriod> activityPeriod = GetActivityPeriodWithWorking(segment, ruleParam);
						activityPeriod->roster = const_cast<ROSTER*>(roster);
						activityPeriods.emplace_back(activityPeriod);
					}
				}
			}
		}
	}
	else {
		Logger::getRuleLogger()->error("WorkingLevel ({}) error.", ruleParam._workingLevel);
	}

	return activityPeriods;

}

shared_ptr<ActivityPeriod> CheckEarnedDaysOffForPRRule::GetActivityPeriodWithWorking(const Activity* activity, const CheckEarnedDaysOffForPRRuleParam& ruleParam) const {
	shared_ptr<ActivityPeriod> activityPeriod = std::make_shared<ActivityPeriod>();

	activityPeriod->activity = const_cast<Activity*>(activity);
	if (ruleParam.MatchDOAssignmentGroupAndAssignment(activity)) {
		activityPeriod->isRest = true;
		activityPeriod->isCheckWorkingTask = false;
	}
	else {
		activityPeriod->isRest = false;

		if (ruleParam.MatchWorkingAssignmentGroupAndAssignment(activity)) {
			activityPeriod->isCheckWorkingTask = true;
		}
		else {
			activityPeriod->isCheckWorkingTask = false;
		}
	}
	return activityPeriod;
}

bool CheckEarnedDaysOffForPRRule::isConsecutiveDays(const shared_ptr<ActivityPeriod>& prevActivityPeriod, const shared_ptr<ActivityPeriod>& currActivityPeriod) const {
	time_t prevEndTimeLoc = GetEndTimeLocAct(prevActivityPeriod->activity);
	time_t currStartTimeLoc = currActivityPeriod->activity->getStartTimeLocAct();

	int days = TimeUtils::DiffCalendarDay(prevEndTimeLoc, currStartTimeLoc);
	if (days <= 2) {
		return true;
	}
	return false;
}

bool CheckEarnedDaysOffForPRRule::isSameDays(const shared_ptr<ActivityPeriod>& prevActivityPeriod, const shared_ptr<ActivityPeriod>& currActivityPeriod) const {
	time_t prevEndTimeLoc = GetEndTimeLocAct(prevActivityPeriod->activity);
	time_t currStartTimeLoc = currActivityPeriod->activity->getStartTimeLocAct();

	int days = TimeUtils::DiffCalendarDay(prevEndTimeLoc, currStartTimeLoc);
	if (days <= 1) {
		return true;
	}
	return false;
}

void CheckEarnedDaysOffForPRRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckEarnedDaysOffForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CheckEarnedDaysOffForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void CheckEarnedDaysOffForPRRule::ThrowRuleViolation(const shared_ptr<ActivityPeriod>& activityPeriod, const int consecutiveWorkingDays, const time_t restStartTimeUtc, const time_t restEndTimeUtc, const CheckEarnedDaysOffForPRRuleParam& ruleParam) const {
	ROSTER* roster = activityPeriod->roster;

	string actualRestHHmm = (restStartTimeUtc > restEndTimeUtc) ? "00:00" : TimeUtils::MinutesTohhmm((int)((restEndTimeUtc - restStartTimeUtc) / 60));
	//在连续执行{n}天任务后，实际休息时长小于最小休息时长。
	string msg = "After consecutive days of duty, the actual rest period is less than the minimum rest.";
	if (ruleParam._fixedRequiredDO != nullptr) {
		msg = "After ({0:consecutiveWorkingDays}) consecutive days of duty ({1:workingLevel}), the actual rest period ({2:actualRestHHmm}) is less than the minimum rest ({3:RequiredDO} days).";
		msg = StringUtils::Format(msg, consecutiveWorkingDays, ruleParam._workingLevel, actualRestHHmm, StringUtils::dtos(*ruleParam._fixedRequiredDO));
	}
	else if (ruleParam._percentRequiredDO != nullptr) {
		msg = "After ({0:consecutiveWorkingDays}) consecutive days of duty ({1:workingLevel}), the actual rest period ({2:actualRestHHmm}) is less than the minimum rest ({3:RequiredDO}% days).";
		msg = StringUtils::Format(msg, consecutiveWorkingDays, ruleParam._workingLevel, actualRestHHmm, StringUtils::dtos(*ruleParam._percentRequiredDO));
	}
	
	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->rosterId = roster->rosterId;
	rv->pairingId = roster->pairing == nullptr ? -1 : roster->pairId;
	if (typeid(*(activityPeriod->activity)) == typeid(Segment)) {
		const Segment* segment = static_cast<const Segment*>(activityPeriod->activity);
		rv->dutySequenceNumber = segment->getDutySeq();
		rv->segmentId = segment->getDBId();
	}
	else if (typeid(*(activityPeriod->activity)) == typeid(Duty)) {
		const Duty* duty = static_cast<const Duty*>(activityPeriod->activity);
		rv->dutySequenceNumber = duty->getDutySeq();
	}
	rv->startDTUtc = restStartTimeUtc;
	rv->endDTUtc = restEndTimeUtc;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("consecutiveWorkingDays", StringUtils::itos(consecutiveWorkingDays)));
	rv->operation_result.insert(pair<string, string>("workingLevel", ruleParam._workingLevel));
	rv->operation_result.insert(pair<string, string>("actualRest", actualRestHHmm));
	rv->operation_result.insert(pair<string, string>("fixedRequiredDO", ruleParam._fixedRequiredDO == nullptr ? "*" : StringUtils::dtos(*ruleParam._fixedRequiredDO)));
	rv->operation_result.insert(pair<string, string>("percentRequiredDO", ruleParam._percentRequiredDO == nullptr ? "*" : StringUtils::dtos(*ruleParam._percentRequiredDO)));

	_ruleViolation.AddRuleViolations(rv);
}