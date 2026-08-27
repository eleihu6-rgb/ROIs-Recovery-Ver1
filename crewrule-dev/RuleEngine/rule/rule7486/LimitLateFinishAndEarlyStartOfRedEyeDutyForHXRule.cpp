/**
 * @file LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-01-26
**/

#include "../RuleSytem.h"
#include "LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRule.h"
#include "Utility.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/TimeUtils.h"
#include "../period/BaseActivityPeriod.h"
#include "RuleParams.h"

bool LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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
	auto activityPeriods = BaseActivityPeriod::GetActivityPeriodsOfDuty(rosters);
	for (const auto& ruleParam : _ruleParams) {
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}
		_ruleViolation.SetRuleParam(ruleParam);
		bool valid = CheckRule(activityPeriods, checkedStartTime, checkedEndTime, weekdayStartFrom, crew, offsetTZMinutes, ruleParam);
		if (!valid) {
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}

bool LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRule::CheckRule(const vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const time_t checkedStartTime, const time_t checkedEndTime, const string& weekdayStartFrom, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam& ruleParam) const {
	bool valid = true;

	if (ruleParam._strConsecutiveDays.empty() || ruleParam._strConsecutiveDays == "*") {
		if (!CheckConsecutiveRedeyeTimes(activityPeriods, offsetTZMinutes, ruleParam)) {
			valid = false;
		}

		if (!CheckRedeyeTimes(activityPeriods, checkedStartTime, checkedEndTime, offsetTZMinutes, ruleParam)) {
			valid = false;
		}
	}
	else {
		map<time_t, time_t>& mpRange = Utility::GetInstancePtr()->getDateRangeFromLong("CD", std::to_string(ruleParam._consecutiveDays), checkedStartTime, checkedEndTime, weekdayStartFrom, offsetTZMinutes);
		for (auto& range : mpRange) {
			time_t rangeStartTimeUtc = range.first;
			time_t rangeEndTimeUtc = range.second;
			if (!CheckConsecutiveRedeyeTimes(activityPeriods, rangeStartTimeUtc, rangeEndTimeUtc, offsetTZMinutes, ruleParam)) {
				valid = false;
			}

			if (!CheckRedeyeTimes(activityPeriods, rangeStartTimeUtc, rangeEndTimeUtc, offsetTZMinutes, ruleParam)) {
				valid = false;
			}
		}
	}
	return valid;
}

bool LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRule::CheckConsecutiveRedeyeTimes(const vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const int offsetTZMinutes, const LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam& ruleParam) const {
	if (ruleParam._strLNPConsecutiveTimes.empty() || ruleParam._strLNPConsecutiveTimes == RuleParamConstant::IGNORED) {
		return true;
	}

	bool valid = true;
	for (size_t i = 0; i < activityPeriods.size(); i++) {
		if (!CheckConsecutiveRedeyeTimes(i, false, activityPeriods, offsetTZMinutes, ruleParam)) {
			valid = false;
		}
	}
	return valid;
}

bool LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRule::CheckConsecutiveRedeyeTimes(const vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const int offsetTZMinutes, const LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam& ruleParam) const {
	if (ruleParam._strLNPConsecutiveTimes.empty() || ruleParam._strLNPConsecutiveTimes == RuleParamConstant::IGNORED) {
		return true;
	}

	bool valid = true;

	for (size_t i = 0; i < activityPeriods.size(); i++) {
		auto& currActivity = activityPeriods[i];

		if (currActivity == nullptr || currActivity->GetEndTimeUtc() < rangeStartTimeUtc) {
			continue;
		}

		if (!CheckConsecutiveRedeyeTimes(i, false, activityPeriods, offsetTZMinutes, ruleParam)) {
			valid = false;
		}

		if (currActivity->GetStartTimeUtc() > rangeEndTimeUtc) {
			break;
		}
	}
	return valid;
}

inline static shared_ptr<BaseActivityPeriod> GetNextWorkActivity(int &newLastIndex, const int lastIndex, const vector<shared_ptr<BaseActivityPeriod>>& activityPeriods) {
	int currIndex = lastIndex;
	while ((size_t)currIndex + 1 < activityPeriods.size()) {
		currIndex++;
		auto& currActivity = activityPeriods[currIndex];
		auto roster = currActivity->GetRoster();
 		if (roster != nullptr && !RuleParams::GetInstancePtr()->isRestAssignment(roster->qualifier, roster->duty)) {
			newLastIndex = (int)currIndex - 1;
			return activityPeriods[currIndex];
		}
	}
	return ((size_t)currIndex + 1) >= activityPeriods.size() ? nullptr : activityPeriods[(size_t)currIndex + 1];
}

bool LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRule::CheckConsecutiveRedeyeTimes(size_t& currIndex, const bool isRollCheck, const vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const int offsetTZMinutes, const LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam& ruleParam) const {
	bool valid = true;

	auto& currActivity = activityPeriods[currIndex];

	auto& beforeActivity = (currIndex == 0) ? nullptr : activityPeriods[currIndex - 1];

	int lastIndex = (int)currIndex;//连续红眼任务最后一个Index
	vector<shared_ptr<BaseActivityPeriod>> consecutiveActivityPeriods;
	bool isContinued = GetConsecutiveTimesLastIndex(lastIndex, consecutiveActivityPeriods, currIndex, activityPeriods, offsetTZMinutes, ruleParam);
	//采用滚动检查，按顺序一个一个检查，不能修改currIndex跳过
	if (!isRollCheck && lastIndex >= 0) {
		currIndex = lastIndex;//跳到最后一个连续天数的索引位置
	}
	if (lastIndex < 0 || !isContinued) return true;
	if (lastIndex >= activityPeriods.size()) {
		return true;
	}
	int newLastIndex = -1;
	shared_ptr<BaseActivityPeriod> afterActivity = GetNextWorkActivity(newLastIndex, lastIndex, activityPeriods);
	if (consecutiveActivityPeriods.empty()) {
		return true;
	}
	if (newLastIndex >= 0) {
		currIndex = newLastIndex;//跳到最后一个连续天数的索引位置
	}
	//检查FDP是否满足
	for (auto& tmpActivity : consecutiveActivityPeriods) {

		if (RosterUtils::ExistExceptionCode(tmpActivity->GetRoster(), ruleParam._exceptionCodes, this->_dbData)) {
			return true;
		}

		if (!ruleParam.CheckMaxFDPOfDuty(tmpActivity->GetActivity())) {
			valid = false;
			ThrowRuleViolationForMaxFDPOfDuty((Duty*)tmpActivity->GetActivity(), tmpActivity->GetRoster(), ruleParam);
		}
	}

	//检查前面休息
	if (beforeActivity != nullptr) {
		time_t actRestStartTimeUtc = 0, actRestEndTimeUtc = 0;
		int actRestMinutes = RosterUtils::GetActualRestMinutes(actRestStartTimeUtc, actRestEndTimeUtc, beforeActivity->GetActivity(), currActivity->GetActivity(), _dbData);

		int warnCode = ruleParam.CheckPrevRest(actRestMinutes, actRestStartTimeUtc, actRestEndTimeUtc, offsetTZMinutes);
		if (warnCode != (int)LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam::WarnCode::NO_WARN) {
			ThrowRuleViolationForEarlyStart(actRestMinutes, actRestStartTimeUtc, actRestEndTimeUtc, beforeActivity->GetRoster(), ruleParam);
			valid = false;
		}
	}

	//检查后面休息
	if (afterActivity != nullptr) {
		time_t actRestStartTimeUtc = 0, actRestEndTimeUtc = 0;
		int actRestMinutes = RosterUtils::GetActualRestMinutes(actRestStartTimeUtc, actRestEndTimeUtc, activityPeriods[lastIndex]->GetActivity(), afterActivity->GetActivity(), _dbData);

		int warnCode = ruleParam.CheckPostRest(actRestMinutes, actRestStartTimeUtc, actRestEndTimeUtc, offsetTZMinutes);
		if (warnCode != (int)LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam::WarnCode::NO_WARN) {
			ThrowRuleViolationForLateFinish(actRestMinutes, actRestStartTimeUtc, actRestEndTimeUtc, afterActivity->GetRoster(), ruleParam);
			valid = false;
		}
	}
	return valid;
}


bool LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRule::CheckRedeyeTimes(const vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const int offsetTZMinutes, const LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam& ruleParam) const {
	if (ruleParam._strLNPTimesRange.empty() || ruleParam._strLNPTimesRange == RuleParamConstant::IGNORED) {
		return true;
	}

	bool valid = true;

	int totalTimes = 0;//合计次数
	shared_ptr<BaseActivityPeriod> beforeActivity = nullptr;//第一个红眼任务前一个任务
	shared_ptr<BaseActivityPeriod> afterActivity = nullptr;//最后一个红眼任务下一个任务

	shared_ptr<BaseActivityPeriod> firstRedeyeActivity = nullptr; //第一个红眼任务
	shared_ptr<BaseActivityPeriod> lastRedeyeActivity = nullptr; //最后一个红眼任务

	vector<shared_ptr<BaseActivityPeriod>> timesActivityPeriods;//计入统计次数红眼任务

	for (int i = 0; i < activityPeriods.size(); i++) {
		auto& currActivity = activityPeriods[i];

		if (currActivity == nullptr || currActivity->GetEndTimeUtc() < rangeStartTimeUtc) {
			beforeActivity = currActivity;
			continue;
		}

		if (currActivity->GetActivity()->isRedEye() && ruleParam.MatchParam(currActivity->GetActivity())) {
			if (totalTimes == 0) {
				firstRedeyeActivity = currActivity;
			}
			lastRedeyeActivity = currActivity;
			int newLastIndex = -1;
			afterActivity = GetNextWorkActivity(newLastIndex, i, activityPeriods);
			if (newLastIndex >= 0) {
				i = newLastIndex;//跳到最后一个连续天数的索引位置
			}
			timesActivityPeriods.emplace_back(currActivity);
			totalTimes++;
		}

		if (totalTimes == 0) {
			beforeActivity = currActivity;
		}

		if (currActivity->GetStartTimeUtc() > rangeEndTimeUtc) {
			break;
		}
	}

	if (timesActivityPeriods.empty()) {
		return true;
	}

	//检查FDP是否满足
	for (auto& tmpActivity : timesActivityPeriods) {

		if (RosterUtils::ExistExceptionCode(tmpActivity->GetRoster(), ruleParam._exceptionCodes, this->_dbData)) {
			return true;
		}

		if (!ruleParam.CheckMaxFDPOfDuty(tmpActivity->GetActivity())) {
			valid = false;
			ThrowRuleViolationForMaxFDPOfDuty((Duty*)tmpActivity->GetActivity(), tmpActivity->GetRoster(), ruleParam);
		}
	}

	if (totalTimes>=ruleParam._lnpTimesRangeLower && totalTimes <= ruleParam._lnpTimesRangeUpper) {
		//检查前面休息
		if (beforeActivity != nullptr) {
			time_t actRestStartTimeUtc = 0, actRestEndTimeUtc = 0;
			int actRestMinutes = RosterUtils::GetActualRestMinutes(actRestStartTimeUtc, actRestEndTimeUtc, beforeActivity->GetActivity(), firstRedeyeActivity->GetActivity(), _dbData);

			int warnCode = ruleParam.CheckPrevRest(actRestMinutes, actRestStartTimeUtc, actRestEndTimeUtc, offsetTZMinutes);
			if (warnCode != (int)LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam::WarnCode::NO_WARN) {
				ThrowRuleViolationForEarlyStart(actRestMinutes, actRestStartTimeUtc, actRestEndTimeUtc, beforeActivity->GetRoster(), ruleParam);
				valid = false;
			}
		}

		//检查后面休息
		if (afterActivity != nullptr) {
			time_t actRestStartTimeUtc = 0, actRestEndTimeUtc = 0;
			int actRestMinutes = RosterUtils::GetActualRestMinutes(actRestStartTimeUtc, actRestEndTimeUtc, lastRedeyeActivity->GetActivity(), afterActivity->GetActivity(), _dbData);

			int warnCode = ruleParam.CheckPostRest(actRestMinutes, actRestStartTimeUtc, actRestEndTimeUtc, offsetTZMinutes);
			if (warnCode != (int)LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam::WarnCode::NO_WARN) {
				ThrowRuleViolationForLateFinish(actRestMinutes, actRestStartTimeUtc, actRestEndTimeUtc, afterActivity->GetRoster(), ruleParam);
				valid = false;
			}
		}
	}
	return valid;
}

bool LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRule::GetConsecutiveTimesLastIndex(int& lastIndex, vector<shared_ptr<BaseActivityPeriod>>& consecutiveActivityPeriods, const size_t currentIndex, const vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const int offsetTZMinutes, const LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam& ruleParam) const {
	int totalConsecutiveTimes = 0;//合计连续次数
	shared_ptr<BaseActivityPeriod> prevActivityInSubset = nullptr; //activityPeriods的子集合中 前一个
	for (int j = (int)currentIndex; j < (int)activityPeriods.size(); j++) {
		auto& currActivityInSubset = activityPeriods[j];
		if (!currActivityInSubset->GetActivity()->isRedEye() || !ruleParam.MatchParam(currActivityInSubset->GetActivity())) {
			//不连续，进行检查
			if (totalConsecutiveTimes > 0 && totalConsecutiveTimes >= ruleParam._lnpConsecutiveTimesLower && totalConsecutiveTimes <= ruleParam._lnpConsecutiveTimesUpper) {
				lastIndex = j - 1;
				return true;
			}
			else {
				lastIndex = j;
				return false;
			}
		}

		if (!IsConsecutiveTimes(prevActivityInSubset, currActivityInSubset, offsetTZMinutes)) {
			//不连续，进行检查
			if (totalConsecutiveTimes >= ruleParam._lnpConsecutiveTimesLower && totalConsecutiveTimes <= ruleParam._lnpConsecutiveTimesUpper) {
				lastIndex = j - 1;
				return true;
			}
			else {
				lastIndex = j - 1;
				return false;
			}
		}

		consecutiveActivityPeriods.emplace_back(currActivityInSubset);
		totalConsecutiveTimes++;

		//if (totalConsecutiveTimes >= ruleParam._lnpConsecutiveTimesLower && totalConsecutiveTimes <= ruleParam._lnpConsecutiveTimesUpper) {
		//	lastIndex = j;
		//	return true;
		//}

		prevActivityInSubset = currActivityInSubset;

	}

	if (totalConsecutiveTimes >= ruleParam._lnpConsecutiveTimesLower && totalConsecutiveTimes <= ruleParam._lnpConsecutiveTimesUpper) {
		lastIndex = (int)activityPeriods.size() - 1;
		return true;
	}
	else {
		lastIndex = (int)activityPeriods.size() - 1;
		return false;
	}
	lastIndex = (int)activityPeriods.size();
	return false;
}

bool LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRule::IsConsecutiveTimes(const shared_ptr<BaseActivityPeriod>& prevActivityPeriod, const shared_ptr<BaseActivityPeriod>& currActivityPeriod, const int offsetTZMinutes) const {
	int consecutiveTimes = RosterUtils::GetConsecutiveTimesWithCurrActivity((prevActivityPeriod == nullptr ? nullptr : prevActivityPeriod->GetActivity()), currActivityPeriod->GetActivity(), offsetTZMinutes);
	if (consecutiveTimes > 0 && prevActivityPeriod != nullptr && prevActivityPeriod->GetActivity() != nullptr) {
		//通过7481记录的红眼航班时间段，判断prevActivityPeriod、currActivityPeriod红眼航班是否连续
		
		auto currRedEyesPeriods = TimeUtils::GetOverlapPeriods(currActivityPeriod->GetStartTimeUtc(), currActivityPeriod->GetEndTimeUtc(),
			currActivityPeriod->GetActivity()->getRedEyeStartMinutes(), currActivityPeriod->GetActivity()->getRedEyeEndMinutes(), offsetTZMinutes);

		if (!currRedEyesPeriods.empty()) {
			time_t currRedEyeStartTime = std::get<0>(currRedEyesPeriods.front());
			time_t currRedEyeEndTime = std::get<1>(currRedEyesPeriods.front());

            time_t beforeDayRedEyeStartTimeLoc = (currRedEyeStartTime - 24 * 3600) + (time_t)offsetTZMinutes * 60;
            time_t beforeDayRedEyeEndTimeLoc = (currRedEyeEndTime - 24 * 3600) + (time_t)offsetTZMinutes * 60;

			time_t prevActivityStartTimeLoc = prevActivityPeriod->GetStartTimeUtc() + (time_t)offsetTZMinutes * 60;
			time_t prevActivityEndTimeLoc = prevActivityPeriod->GetEndTimeUtc() + (time_t)offsetTZMinutes * 60;
            //如果前一个任务的本地时间段与当前红眼任务的前一天本地红眼时间段有重叠，则认为是连续的
			return prevActivityEndTimeLoc >= beforeDayRedEyeStartTimeLoc && prevActivityStartTimeLoc <= beforeDayRedEyeEndTimeLoc;
		}

	}
	return consecutiveTimes > 0;
}

void LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}


void LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRule::ThrowRuleViolationForLateFinish(const int actRestMinutes, const time_t actRestStartTimeUtc, const time_t actRestEndTimeUtc, const ROSTER* roster, const LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam& ruleParam) const {
	string actRestHHmm = TimeUtils::MinutesTohhmm(actRestMinutes);
	string msg;
	if (!ruleParam._strLNPConsecutiveTimes.empty() && ruleParam._strLNPConsecutiveTimes != RuleParamConstant::IGNORED) {
		//连续{n}个红眼任务结束后，实际休息时长小于最小需求。最小休息={HH:mm}, 最小本地夜晚={n}
		msg = "After {0:lnpConsecutiveTimes} consecutive red-eye duties, the actual rest period ({1:actualRest}) is less than the minimum required rest {2:minrest}{3:minLocalNightNum}.";
		msg = StringUtils::Format(msg, ruleParam._strLNPConsecutiveTimes, actRestHHmm, 
			(ruleParam._strPostMinRest.empty() || ruleParam._strPostMinRest == RuleParamConstant::IGNORED) ? "" : "(" + ruleParam._strPostMinRest + ") ",
			(ruleParam._strPostMinLocalNightNums.empty() || ruleParam._strPostMinLocalNightNums == RuleParamConstant::IGNORED) ? "" : "(" + ruleParam._strPostMinLocalNightNums + "LN) ");
	}
	else {
		//连续{n}天的{m}个红眼任务结束后，实际休息时长小于最小需求。最小休息={HH:mm}, 最小本地夜晚={n}
		msg = "After {0:lnpTimesRange} red-eye duties at {1:consecutiveDays} consecutive days, the actual rest period ({2:actualRest}) is less than the minimum required rest {3:minrest}{4:minLocalNightNum}.";
		msg = StringUtils::Format(msg, ruleParam._strLNPTimesRange, ruleParam._strConsecutiveDays, actRestHHmm,
			(ruleParam._strPostMinRest.empty() || ruleParam._strPostMinRest == RuleParamConstant::IGNORED) ? "" : "(" + ruleParam._strPostMinRest + ") ",
			(ruleParam._strPostMinLocalNightNums.empty() || ruleParam._strPostMinLocalNightNums == RuleParamConstant::IGNORED) ? "" : "(" + ruleParam._strPostMinLocalNightNums + "LN) ");
	}

	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->rosterId = roster->rosterId;
	rv->pairingId = roster->pairing == nullptr ? -1 : roster->pairId;
	rv->startDTUtc = actRestStartTimeUtc;
	rv->endDTUtc = actRestEndTimeUtc;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("lnpConsecutiveTimes", ruleParam._strLNPConsecutiveTimes));
	rv->operation_result.insert(pair<string, string>("lnpTimesRange", ruleParam._strLNPTimesRange));
	rv->operation_result.insert(pair<string, string>("consecutiveDays", ruleParam._strConsecutiveDays));
	rv->operation_result.insert(pair<string, string>("actualRest", actRestHHmm));
	rv->operation_result.insert(pair<string, string>("postMinRest", ruleParam._strPostMinRest));
	rv->operation_result.insert(pair<string, string>("postMinLocalNightNums", ruleParam._strPostMinLocalNightNums));

	_ruleViolation.AddRuleViolations(rv);
}

void LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRule::ThrowRuleViolationForEarlyStart(const int actRestMinutes, const time_t actRestStartTimeUtc, const time_t actRestEndTimeUtc, const ROSTER* roster, const LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam& ruleParam) const {
	string actRestHHmm = TimeUtils::MinutesTohhmm(actRestMinutes);
	string msg;
	if (!ruleParam._strLNPConsecutiveTimes.empty() && ruleParam._strLNPConsecutiveTimes != RuleParamConstant::IGNORED) {
		//连续{n}个红眼任务开始前，实际休息时长小于最小需求。最小休息={HH:mm}, 最小本地夜晚={n}
		msg = "Before the start of {0:lnpConsecutiveTimes} consecutive red-eye duties, the actual rest period ({1:actualRest}) is less than the minimum required rest {2:minrest}{3:minLocalNightNum}.";
		msg = StringUtils::Format(msg, ruleParam._strLNPConsecutiveTimes, actRestHHmm,
			(ruleParam._strPrevMinRest.empty() || ruleParam._strPrevMinRest == RuleParamConstant::IGNORED) ? "" : "(" + ruleParam._strPrevMinRest + ") ",
			(ruleParam._strPrevMinLocalNightNums.empty() || ruleParam._strPrevMinLocalNightNums == RuleParamConstant::IGNORED) ? "" : "(" + ruleParam._strPrevMinLocalNightNums + "LN) ");
	}
	else {
		//连续{n}天的{m}个红眼任务开始前，实际休息时长小于最小需求。最小休息={HH:mm}, 最小本地夜晚={n}
		msg = "Before the start of {0:lnpTimesRange} red-eye duties at {1:consecutiveDays} consecutive days, the actual rest period ({2:actualRest}) is less than the minimum required rest {3:minrest}{4:minLocalNightNum}.";
		msg = StringUtils::Format(msg, ruleParam._strLNPTimesRange, ruleParam._strConsecutiveDays, actRestHHmm,
			(ruleParam._strPrevMinRest.empty() || ruleParam._strPrevMinRest == RuleParamConstant::IGNORED) ? "" : "(" + ruleParam._strPrevMinRest + ") ",
			(ruleParam._strPrevMinLocalNightNums.empty() || ruleParam._strPrevMinLocalNightNums == RuleParamConstant::IGNORED) ? "" : "(" + ruleParam._strPrevMinLocalNightNums + "LN) ");
	}

	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->rosterId = roster->rosterId;
	rv->pairingId = roster->pairing == nullptr ? -1 : roster->pairId;
	rv->startDTUtc = actRestStartTimeUtc;
	rv->endDTUtc = actRestEndTimeUtc;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("lnpConsecutiveTimes", ruleParam._strLNPConsecutiveTimes));
	rv->operation_result.insert(pair<string, string>("lnpTimesRange", ruleParam._strLNPTimesRange));
	rv->operation_result.insert(pair<string, string>("consecutiveDays", ruleParam._strConsecutiveDays));
	rv->operation_result.insert(pair<string, string>("actualRest", actRestHHmm));
	rv->operation_result.insert(pair<string, string>("prevMinRest", ruleParam._strPrevMinRest));
	rv->operation_result.insert(pair<string, string>("prevMinLocalNightNums", ruleParam._strPrevMinLocalNightNums));

	_ruleViolation.AddRuleViolations(rv);
}

void LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRule::ThrowRuleViolationForMaxFDPOfDuty(const Duty* duty, const ROSTER* roster, const LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam& ruleParam) const {
	string actFDPHHmm = TimeUtils::MinutesTohhmm(duty->getActualFDP());
	//红眼任务的最大实际FDP超过需求
	string msg = "The red-eye flight duty period ({0:actualFDP}) is less than the minimum required flight duty period ({1:maxFDPOfDutyRange}) .";
	msg = StringUtils::Format(msg, actFDPHHmm, ruleParam._strMaxFDPOfDutyRange);
	
	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->rosterId = roster->rosterId;
	rv->pairingId = roster->pairing == nullptr ? -1 : roster->pairId;
	rv->startDTUtc = roster->actStrUtc;
	rv->endDTUtc = roster->actRestStrUtc;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("actFDPHHmm", actFDPHHmm));
	rv->operation_result.insert(pair<string, string>("maxFDPOfDutyRange", ruleParam._strMaxFDPOfDutyRange));

	_ruleViolation.AddRuleViolations(rv);
}