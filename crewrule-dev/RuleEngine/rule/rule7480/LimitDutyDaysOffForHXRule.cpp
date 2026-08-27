/**
 * @file LimitDutyDaysOffForHXRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-11-14
**/

#include "../RuleSytem.h"
#include "LimitDutyDaysOffForHXRule.h"
#include "Utility.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/TimeUtils.h"
#include "TimezoneUtils.h"
#include "RuleParams.h"

//返回值<Manday日期(本地时区)，Manday对象>
inline static unordered_map<time_t, std::shared_ptr<CREW_MANDAY_BASIC>> GetMandayMap(const std::shared_ptr<CREW>& crew) {
	unordered_map<time_t, std::shared_ptr<CREW_MANDAY_BASIC>> mandayMap;
	const auto& mandayFds = crew->mandayFdList;
	const auto& mandayCcAm = crew->mandayCcAmList;
	bool isFd = crew->division == "P";
	if (isFd) {
		for (size_t i = 0; i < mandayFds.size(); i++) {
			const auto& manday = mandayFds[i];
			mandayMap[manday->dateLoc] = manday;
		}
	}
	else {
		for (size_t m = 0; m < mandayCcAm.size(); m++) {
			const auto& manday = mandayCcAm[m];
			mandayMap[manday->dateLoc] = manday;
		}
	}

	return mandayMap;
}

bool LimitDutyDaysOffForHXRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;
	if (rosters.empty()) {
		return true;
	}
	time_t checkedStartTime = this->_dbData->scenario.startDtUTC;
	time_t checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;

	checkedStartTime = std::min(checkedStartTime, rosters[0]->actStrUtc);
	checkedEndTime = std::max(checkedEndTime, rosters[rosters.size() - 1]->restStrUtc);

	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string crewBase = crew->getPrimeBase();
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeLocSch(), crewBase, this->GetDataContext());
	string weekdayStartFrom = this->_dbData->getWeekdayStartFrom();

	unordered_map<time_t, std::shared_ptr<CREW_MANDAY_BASIC>> crewMandayMap = GetMandayMap(crew);
	//获得父子规则
	auto parentChildRuleParams = GetRuleParamMap();

	for (const auto& parentChildRuleParam : parentChildRuleParams) {
		auto parentRuleParam = std::get<0>(parentChildRuleParam);
		auto& childrenRuleParams = std::get<1>(parentChildRuleParam);
		if (!parentRuleParam->MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}

		_ruleViolation.SetRuleParam(*parentRuleParam);

		//如果启用了DDO后检查逻辑，则使用新的平移检查逻辑
		if (parentRuleParam->_followingStartOfDDO != nullptr && *parentRuleParam->_followingStartOfDDO) {
			bool valid = CheckRuleFollowingDdo(rosters, crewMandayMap, checkedStartTime, checkedEndTime, crew, offsetTZMinutes, *parentRuleParam);
			if (!valid) {
				passAllRule = false;
				if (!IsCheckAllRule()) {
					return passAllRule;
				}
			}
			continue;
		}

		bool valid = CheckRule(rosters, checkedStartTime, checkedEndTime, weekdayStartFrom, crew, offsetTZMinutes, *parentRuleParam, childrenRuleParams);
		if (!valid) {
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}

vector<std::tuple<LimitDutyDaysOffForHXRuleParam*, vector<LimitDutyDaysOffForHXRuleParam*>>> LimitDutyDaysOffForHXRule::GetRuleParamMap() const {
	vector<std::tuple<LimitDutyDaysOffForHXRuleParam*, vector<LimitDutyDaysOffForHXRuleParam*>>> allRuleParams;

	map<int, vector<LimitDutyDaysOffForHXRuleParam*>> ruleParamMap;//通过consecutiveDays分组
	for (const auto& ruleParam : _ruleParams) {
		ruleParamMap[ruleParam._consecutiveDays].emplace_back(const_cast<LimitDutyDaysOffForHXRuleParam*>(&ruleParam));
	}

	for (auto& pair : ruleParamMap) {
		auto& ruleParamsByDays = pair.second;
		LimitDutyDaysOffForHXRuleParam* mainRuleParam = nullptr;
		vector<LimitDutyDaysOffForHXRuleParam*> dependRuleParams;
		for (auto& tmpRuleParam : ruleParamsByDays) {
			if ((tmpRuleParam->_isCrewAgreeWork == nullptr || !*tmpRuleParam->_isCrewAgreeWork)
				&& (tmpRuleParam->_isDHDLastDay == nullptr || !*tmpRuleParam->_isDHDLastDay)) {
				mainRuleParam = tmpRuleParam;
			}
			else {
				dependRuleParams.emplace_back(tmpRuleParam);
			}
		}
		allRuleParams.emplace_back(std::make_tuple(mainRuleParam, dependRuleParams));
	}

	return allRuleParams;
}

bool LimitDutyDaysOffForHXRule::CheckRule(const std::vector<const ROSTER*>& rosters, const time_t checkedStartTime, const time_t checkedEndTime, const string& weekdayStartFrom, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const LimitDutyDaysOffForHXRuleParam& ruleParam, const vector<LimitDutyDaysOffForHXRuleParam*>& childrenRuleParams) const {
	int period = ruleParam._consecutiveDays;
	map<time_t, time_t>& mpRange = Utility::GetInstancePtr()->getDateRangeFromLong("CD", std::to_string(period), checkedStartTime, checkedEndTime, weekdayStartFrom, offsetTZMinutes);
	bool passAllRule = true;

	vector<ROSTER*> possibleLayoverGroundRosters;
	//获得可能Layover Assignments任务列表
	if (ruleParam.IsCheckLayoverAssignment()) {
		possibleLayoverGroundRosters = GetPossibleLayoverGroundRosters(crew, ruleParam);
	}

	for (auto& pair : mpRange)
	{
		time_t rangeStartTimeUtc = pair.first;
		time_t rangeEndTimeUtc = pair.second;
		time_t lastDayStartTimeUtc = rangeStartTimeUtc + (time_t)(24 * 3600 * (ruleParam._consecutiveDays - 1));//Consecutive Days最后一天0点开始时间

		int totalDaysOff = 0;//合计DaysOff数量(不需要连续)
		int maxDaysOffInRest = 0;

		bool valid = CheckRule(maxDaysOffInRest, totalDaysOff, rosters, possibleLayoverGroundRosters, crew, rangeStartTimeUtc, rangeEndTimeUtc, lastDayStartTimeUtc, offsetTZMinutes, ruleParam);
		bool matchChildRuleValid = false;
		if (!valid) {
			for (auto childRuleParam : childrenRuleParams) {
				if (!MatchChildRuleParam(rosters, rangeStartTimeUtc, rangeEndTimeUtc, lastDayStartTimeUtc, offsetTZMinutes, *childRuleParam)) {
					continue;
				}
				matchChildRuleValid = true;
				totalDaysOff = 0;
				maxDaysOffInRest = 0;		
				_ruleViolation.SetRuleParam(*childRuleParam);
				time_t tmpRangeStartTimeUtc = rangeStartTimeUtc;
				time_t tmpRangeEndTimeUtc = lastDayStartTimeUtc + (time_t)(24 * 3600 * (childRuleParam->GetIncConsecutiveDays() + 1)) - 1;
				time_t tmpLastDayStartTimeUtc = lastDayStartTimeUtc + (time_t)(24 * 3600 * (childRuleParam->GetIncConsecutiveDays()));//Consecutive Days最后一天0点开始时间
				valid = CheckRule(maxDaysOffInRest, totalDaysOff, rosters, possibleLayoverGroundRosters, crew, tmpRangeStartTimeUtc, tmpRangeEndTimeUtc, tmpLastDayStartTimeUtc, offsetTZMinutes, *childRuleParam);
				if (valid) {
					break;
				}
				else {
					if (childRuleParam->_minConsecutiveDO != nullptr && !IgnoreCheck(rosters, crew, tmpRangeStartTimeUtc, tmpRangeEndTimeUtc, offsetTZMinutes)) {
						ThrowRuleViolationForMinConsecutiveDO(tmpRangeStartTimeUtc, tmpRangeEndTimeUtc, maxDaysOffInRest, *childRuleParam);
					}
					if (childRuleParam->_minDO != nullptr && !IgnoreCheck(rosters, crew, tmpRangeStartTimeUtc, tmpRangeEndTimeUtc, offsetTZMinutes)) {
						ThrowRuleViolationForMinDO(tmpRangeStartTimeUtc, tmpRangeEndTimeUtc, totalDaysOff, *childRuleParam);
					}
                    passAllRule = false;
				}
			}
		}
		if (!matchChildRuleValid && !valid) {
			passAllRule = false;
			if (ruleParam._minConsecutiveDO != nullptr && !IgnoreCheck(rosters, crew, rangeStartTimeUtc, rangeEndTimeUtc, offsetTZMinutes)) {
				ThrowRuleViolationForMinConsecutiveDO(rangeStartTimeUtc, rangeEndTimeUtc, maxDaysOffInRest, ruleParam);
			}
			if (ruleParam._minDO != nullptr && !IgnoreCheck(rosters, crew, rangeStartTimeUtc, rangeEndTimeUtc, offsetTZMinutes)) {
				ThrowRuleViolationForMinDO(rangeStartTimeUtc, rangeEndTimeUtc, totalDaysOff, ruleParam);
			}
		}
	}
	return passAllRule;
}

bool LimitDutyDaysOffForHXRule::CheckRule(int& maxDaysOffInRest, int& totalDaysOff, const std::vector<const ROSTER*>& rosters, const vector<ROSTER*>& possibleLayoverGroundRosters, const std::shared_ptr<CREW>& crew, const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const time_t lastDayStartTimeUtc, const int offsetTZMinutes, const LimitDutyDaysOffForHXRuleParam& ruleParam) const {
	bool valid = false;
	auto& dayOffDefineEx = _dayOffDefinition.getReqExRow();
	bool isCountBlankDay = dayOffDefineEx.isBlankDayCountedDO;

	if (rosters.empty()) {
		return isCountBlankDay ? true : false;
	}

	//roster之前DDO使用manday数据统计， actDaysOffDateInManday是按升序排序DDO日期
	auto actDaysOffDateInManday = GetDaysOffFromManday(rosters, crew, rangeStartTimeUtc, rangeEndTimeUtc, offsetTZMinutes, isCountBlankDay,ruleParam);
	if (CheckDaysOffFromManday(actDaysOffDateInManday, offsetTZMinutes, ruleParam)) {
		//仅检查Manday中DDO是否满足要求，若已满足则直接返回true（无需结合Rosters一起检查）
		return true;
	}

	totalDaysOff += (int)actDaysOffDateInManday.size();

	//累计[rangeStartTimeUtc,rangeEndTimeUtc]时间段内连续DO数量
	int daysOff = 0;//连续分配DO的数量(可能包含空白天)
	int daysOffOfAssignment = 0;//连续分配DO的数量(不包含空白天)
	time_t firstDaysOffStartTimeUtc = -1, lastDaysOffEndTimeUtc = -1; //第一个DO开始时间,最后一个DO结束时间
	time_t restStartTimeUtc = -1, restEndTimeUtc = -1;//包含Rest和DO Extension Assignment的休息时间
	ROSTER* prevRoster = nullptr;
	ROSTER* prevWorkRoster = nullptr;

	
	for (size_t i = 0; i <= rosters.size(); i++) {
		ROSTER* currRoster = i >= rosters.size() ? nullptr : const_cast<ROSTER*>(rosters[i]);
		ROSTER* nextRoster = (i + 1) >= rosters.size() ? nullptr : const_cast<ROSTER*>(rosters[i + 1]);

		if (currRoster != nullptr && currRoster->getRestStartUtcAct() < rangeStartTimeUtc) {
			prevRoster = currRoster;
			continue;
		}

		vector<ROSTER*> layoverGroundRosters; //在Duty Layover分配的满足条件的EXB任务
		if (currRoster != nullptr && currRoster->pairing != nullptr) {
			layoverGroundRosters = GetLayoverGroundRosters(currRoster, possibleLayoverGroundRosters, rangeStartTimeUtc, rangeEndTimeUtc, ruleParam);
			if (CheckDaysOffFromLayoverGroundRosters(layoverGroundRosters, offsetTZMinutes, ruleParam)) {
				//仅检查Duty Layover中DDO是否满足要求，若已满足则直接返回true（无需继续一起检查）
				return true;
			}
			totalDaysOff += (int)layoverGroundRosters.size();
		}

		if (restStartTimeUtc == -1) {
			if (prevRoster == nullptr) {
				restStartTimeUtc = std::min(_dbData->scenario.startDtUTC, rangeStartTimeUtc);
			}
			else {
				restStartTimeUtc = dayOffDefineEx.isDoExtensionAssignment(prevRoster->qualifier, this->_dbData) ? prevRoster->getStartTimeUtcAct() : (prevRoster->getRestStartUtcAct() + GetEndTimeGapInSec(prevRoster));
				restStartTimeUtc = std::max(restStartTimeUtc, rangeStartTimeUtc - DO_FORWARD_EXT_DURATION);//restStartTimeUtc最多向前延伸1天
			}
		}

		if (restStartTimeUtc > lastDayStartTimeUtc) {
			//休息开始时间超过最后一天0点，则违规了，直接退出。
			return false;
		}

		if (isCountBlankDay) {
			//获得二者之间的空白天数
			time_t prevRestStartTimeUtc = prevRoster == nullptr ? rangeStartTimeUtc : (prevRoster->getRestStartUtcAct() + GetEndTimeGapInSec(prevRoster));
			prevRestStartTimeUtc = std::max(prevRestStartTimeUtc, rangeStartTimeUtc);//DDO本体必须在周期内
			//prevRestStartTimeUtc = std::min(prevRestStartTimeUtc, restStartTimeUtc);
			//当currRosterInSubRoster == nullptr 则后续没有任务，结束时间为scenario结束时间
			time_t checkRestEndTimeUtc = (currRoster == nullptr) ? std::min(rangeEndTimeUtc, _dbData->scenario.endDtUTC) : currRoster->getStartTimeUtcAct();
			if (currRoster != nullptr && currRoster->getStartTimeUtcAct() > rangeEndTimeUtc) {
				checkRestEndTimeUtc = std::min(currRoster->getStartTimeUtcAct(), rangeEndTimeUtc);
			}
			int blankDays = TimeUtils::CalculateFullDaysBetweenTimes(prevRestStartTimeUtc, checkRestEndTimeUtc, offsetTZMinutes);
			daysOff += blankDays;
			daysOffOfAssignment += blankDays;
		}

		if (currRoster == nullptr) {
			restEndTimeUtc = std::min(rangeEndTimeUtc, _dbData->scenario.endDtUTC); //后续没有任务，结束时间为scenario结束时间
		}
		else if (currRoster->getStartTimeUtcAct() < rangeEndTimeUtc && dayOffDefineEx.isDoAssignment(currRoster->qualifier, this->_dbData)) {
			if (firstDaysOffStartTimeUtc < 0) {
				firstDaysOffStartTimeUtc = currRoster->getStartTimeUtcAct();
			}
			lastDaysOffEndTimeUtc = currRoster->getEndTimeUtcAct();
			daysOff++;
			daysOffOfAssignment++;
		}
		else if (dayOffDefineEx.isDoExtensionAssignment(currRoster->qualifier, this->_dbData)) {
			restEndTimeUtc = currRoster->getRestStartUtcAct() + GetEndTimeGapInSec(currRoster);
		}
		else {
			restEndTimeUtc = std::min(currRoster->getStartTimeUtcAct(), rangeEndTimeUtc);
		}

		//下一个Roster不存在或超过检查范围，设置restEndTimeUtc
		if (restEndTimeUtc < 0) {
			if (nextRoster == nullptr) {
				restEndTimeUtc = rangeEndTimeUtc + DO_BACKWARD_EXT_DURATION;//restEndTimeUtc最多向后延伸1天
			}
			else {
				//nextRoster是休息，则最后一天休息可以向后延申
				if (RuleParams::GetInstancePtr()->isRestAssignment(nextRoster->qualifier, nextRoster->duty)) {
					restEndTimeUtc = nextRoster->getEndTimeUtcAct();
				}
				else {
					restEndTimeUtc = nextRoster->getStartTimeUtcAct();
				}
				restEndTimeUtc = std::min(restEndTimeUtc, rangeEndTimeUtc + DO_BACKWARD_EXT_DURATION);//restEndTimeUtc最多向后延伸1天
			}
		}

		if (restEndTimeUtc > restStartTimeUtc) {
			if (!isCountBlankDay) {
				//空白天不能作为DO，此时restStartTimeUtc、restEndTimeUtc最多向前和向后延伸1天
				restStartTimeUtc = std::max(firstDaysOffStartTimeUtc - DO_FORWARD_EXT_DURATION, restStartTimeUtc);
				restEndTimeUtc = std::min(lastDaysOffEndTimeUtc + 60 + DO_BACKWARD_EXT_DURATION, restEndTimeUtc);//DO结束实际23:59，因此需要增加60秒
			}

			//累计[restStartTimeUtc,restEndTimeUtc]之间的DDO数量后，检查是否满足要求
			int excludingDONum = ExcludingDaysOffNum(prevWorkRoster, currRoster, ruleParam);//排除满足条件的DO数量
		
			if (CheckDaysOff(maxDaysOffInRest, totalDaysOff, daysOff, daysOffOfAssignment, excludingDONum, restStartTimeUtc, restEndTimeUtc, actDaysOffDateInManday, offsetTZMinutes, ruleParam)) {
				valid = true;
				break;
			}
		}

		if (restEndTimeUtc >= 0) {
			daysOff = 0;
			daysOffOfAssignment = 0;
			restStartTimeUtc = -1;
			restEndTimeUtc = -1;
			firstDaysOffStartTimeUtc = -1;
			lastDaysOffEndTimeUtc = -1;
		}
		
		if (currRoster != nullptr && dayOffDefineEx.isWorkAssignment(currRoster->qualifier, this->_dbData)) {
			prevWorkRoster = currRoster;
		}
		
		prevRoster = currRoster;

		if (currRoster == nullptr || currRoster->getStartTimeUtcAct() > rangeEndTimeUtc) {
			break;
		}
	}


	return valid;
}

bool LimitDutyDaysOffForHXRule::CheckDaysOffFromManday(const vector<time_t>& actDaysOffDateInManday, const int offsetTZMinutes, const LimitDutyDaysOffForHXRuleParam& ruleParam) const {
	bool valid = false;

	if (ruleParam._minConsecutiveDO != nullptr) {
		//当前检查周期满足要求，则退出检查
		int consecutiveDO = 0;//连续DO数量
		for(size_t i = 0; i < actDaysOffDateInManday.size(); i++) {
			time_t currDayLoc = actDaysOffDateInManday[i];
			time_t nextDayLoc = i < actDaysOffDateInManday.size() - 1 ? actDaysOffDateInManday[i + 1] : -1;
			
			if (currDayLoc + 86400 == nextDayLoc) {
				//连续DO
				consecutiveDO++;
			}

			if (consecutiveDO >= *ruleParam._minConsecutiveDO) {
				//当前检查周期满足要求，则退出检查
				valid = true;
			}
		}
	}

	int totalDaysOff = actDaysOffDateInManday.size();
	if (ruleParam._minDO != nullptr && totalDaysOff >= *ruleParam._minDO) {
		//当前检查周期满足要求，则退出检查
		valid = true;
	}
	return valid;
}

vector<ROSTER*> LimitDutyDaysOffForHXRule::GetPossibleLayoverGroundRosters(const std::shared_ptr<CREW>& crew, const LimitDutyDaysOffForHXRuleParam& ruleParam) const {
	vector<ROSTER*> results;
	for (auto& roster : crew->rosterList) {
		if (roster == nullptr) {
			continue;
		}

		//获得Layover Assignment类型的ground roster，并且时长大于等于LayoverAssignmentsDuration（可能计入DDO的EXB任务）
		//Ground roster的pairing为nullptr，且assignment匹配配置的任务类型（如EXB）
		if (roster->pairing == nullptr) {
			if (std::find(ruleParam._layoverAssignments.begin(), ruleParam._layoverAssignments.end(), roster->qualifier) != ruleParam._layoverAssignments.end()) {
				int durationMinutes = static_cast<int>((roster->actRestStrUtc - roster->actStrUtc) / 60);
				if (durationMinutes >= ruleParam._layoverAssignmentsDuration) {
					results.emplace_back(roster.get());
				}
			}
		}
	}
	return results;
}

vector<ROSTER*> LimitDutyDaysOffForHXRule::GetLayoverGroundRosters(const ROSTER* roster, const vector<ROSTER*>& possibleLayoverGroundRosters, const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const LimitDutyDaysOffForHXRuleParam& ruleParam) const {
	vector<ROSTER*> layoverGroundRosters;

	if (roster->pairing == nullptr) {
		return layoverGroundRosters;
	}
	Duty* beforeDuty = nullptr;
	for (auto currDuty : roster->pairing->getDutyVec()) {
		if (beforeDuty == nullptr) {
			beforeDuty = currDuty;
			continue;
		}

		time_t layoverStartTime = beforeDuty->getLastDropoff()->getEndUtc();
		time_t layoverEndTime = currDuty->getFirstPickup()->getStartUtc();
		for (size_t i = 0; i < possibleLayoverGroundRosters.size(); i++) {
			auto layoverRoster = possibleLayoverGroundRosters[i];
			time_t layoverRosterStartTime = layoverRoster->actStrUtc;
			time_t layoverRosterEndTime = layoverRoster->actRestStrUtc;

			if (layoverRosterStartTime >= rangeStartTimeUtc && layoverRosterStartTime <= rangeEndTimeUtc
				&& layoverRosterEndTime >= rangeStartTimeUtc && layoverRosterEndTime <= rangeEndTimeUtc) {
				continue;
			}
			
			if (layoverRosterStartTime >= layoverStartTime && layoverRosterStartTime <= layoverEndTime
				&& layoverRosterEndTime >= layoverStartTime && layoverRosterEndTime <= layoverEndTime) {
				layoverGroundRosters.emplace_back(layoverRoster);
			}

		}
		beforeDuty = currDuty;
	}
	return layoverGroundRosters;
}

bool LimitDutyDaysOffForHXRule::CheckDaysOff(int& maxDaysOffInRest, int& totalDaysOff, const int daysOff, const int daysOffOfAssignment, const int excludingDONum, const time_t restStartTimeUtc, const time_t restEndTimeUtc, const vector<time_t>& actDaysOffDateInManday, const int offsetTZMinutes, const LimitDutyDaysOffForHXRuleParam& ruleParam) const {
	bool valid = false;

	int daysOffInRest = _dayOffDefinition.countDaysOffInRest(restStartTimeUtc, restEndTimeUtc, offsetTZMinutes);

	int actDaysOff = daysOffInRest > daysOff ? daysOff : daysOffInRest; //实际计入DO数量
	if (excludingDONum > 0) {
		actDaysOff -= excludingDONum;
	}
	if (actDaysOff < 0) actDaysOff = 0;
	//daysOffOfAssignment是分配的DDO任务，也需要满足DDO定义要求
	actDaysOff = std::min(actDaysOff, daysOffOfAssignment);

	maxDaysOffInRest = std::max(maxDaysOffInRest, actDaysOff);
	totalDaysOff += actDaysOff;

	if (ruleParam._minConsecutiveDO != nullptr && actDaysOff >= *ruleParam._minConsecutiveDO) {
		//当前检查周期满足要求，则退出检查
		valid = true;
	}

	if (ruleParam._minDO != nullptr && totalDaysOff >= *ruleParam._minDO) {
		//当前检查周期满足要求，则退出检查
		valid = true;
	}

	return valid;
}

bool LimitDutyDaysOffForHXRule::CheckRuleFollowingDdo(const std::vector<const ROSTER*>& rosters, const unordered_map<time_t, std::shared_ptr<CREW_MANDAY_BASIC>>& crewMandayMap, const time_t checkedStartTime, const time_t checkedEndTime, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const LimitDutyDaysOffForHXRuleParam& ruleParam) const {
	bool passAllRule = true;
	int consecutiveDays = ruleParam._consecutiveDays;
	int minConsecutiveDO = ruleParam._minConsecutiveDO != nullptr ? *ruleParam._minConsecutiveDO : 2;

	vector<time_t> allDaysOffDates = GetDaysOffDates(rosters, crewMandayMap, checkedStartTime - (time_t)ruleParam._consecutiveDays * 24 * 3600, checkedEndTime + (time_t)ruleParam._consecutiveDays * 24 * 3600, crew, offsetTZMinutes, ruleParam);
	time_t scenarioStartLoc = checkedStartTime + (time_t)offsetTZMinutes * 60 - (time_t)ruleParam._consecutiveDays * 24 * 3600;
	time_t scenarioEndLoc = checkedEndTime + (time_t)offsetTZMinutes * 60;
	int firstConsecutiveStartIndex = -1;//首次出现连续DDO的第一个索引
	int firstConsecutiveEndIndex = -1;//首次出现连续DDO的最后一个索引
	if (allDaysOffDates.empty() || !HasConsecutiveDDO(firstConsecutiveStartIndex, firstConsecutiveEndIndex, allDaysOffDates, scenarioStartLoc, scenarioEndLoc, ruleParam)) {
		ThrowRuleViolationForMinConsecutiveDO(checkedStartTime, checkedEndTime, 0, ruleParam);
		return false;
	}

	//找到第一个满足条件的连续DDO，然后向前按14天检查
	//int firstConsecutiveStartIndex = firstConsecutiveEndIndex - *ruleParam._minConsecutiveDO + 1;
	if (firstConsecutiveStartIndex >= 0 && firstConsecutiveStartIndex < allDaysOffDates.size()) {
		time_t firstConsecutiveDdoStartDate = allDaysOffDates[(size_t)firstConsecutiveStartIndex];//本地日期
		time_t prevCheckEnd = firstConsecutiveDdoStartDate;
		time_t prevCheckStart = prevCheckEnd - (time_t)consecutiveDays * 24 * 3600;

		while (prevCheckEnd >= checkedStartTime) {
			int tmpFirstConsecutiveStartIndex = -1;
			int tmpFirstConsecutiveEndIndex = -1;
			if (!HasConsecutiveDDO(tmpFirstConsecutiveStartIndex, tmpFirstConsecutiveEndIndex, allDaysOffDates, prevCheckStart, prevCheckEnd, ruleParam)
					&& !IgnoreCheck(rosters, crew, prevCheckStart - (time_t)60 * offsetTZMinutes, prevCheckEnd - (time_t)60 * offsetTZMinutes, offsetTZMinutes)) {
				ThrowRuleViolationForMinConsecutiveDO(prevCheckStart - (time_t)60 * offsetTZMinutes, prevCheckEnd - (time_t)60 * offsetTZMinutes, 0, ruleParam);
				passAllRule = false;
				if (!IsCheckAllRule()) {
					return false;
				}
			}

			prevCheckEnd = prevCheckStart;
			prevCheckStart = prevCheckEnd - (time_t)consecutiveDays * 24 * 3600;
		}
	}
	
	
	//找到第一个满足条件的连续DDO，然后向后按14天检查
	if (firstConsecutiveEndIndex >= 0 && firstConsecutiveEndIndex < allDaysOffDates.size()) {
		time_t firstConsecutiveDdoEndDate = allDaysOffDates[(size_t)firstConsecutiveEndIndex];//本地日期
		time_t nextCheckStart = firstConsecutiveDdoEndDate + (time_t)24 * 3600;
		time_t nextCheckEnd = nextCheckStart + (time_t)consecutiveDays * 24 * 3600;
		while (nextCheckStart <= checkedEndTime) {
			int tmpFirstConsecutiveStartIndex = -1;//首次出现连续DDO的第一个索引
			int tmpFirstConsecutiveEndIndex = -1;//首次出现连续DDO的最后一个索引
			if (!HasConsecutiveDDO(tmpFirstConsecutiveStartIndex, tmpFirstConsecutiveEndIndex, allDaysOffDates, nextCheckStart, nextCheckEnd, ruleParam)
					&& !IgnoreCheck(rosters, crew, nextCheckStart - (time_t)60 * offsetTZMinutes, nextCheckEnd - (time_t)60 * offsetTZMinutes, offsetTZMinutes)) {
				ThrowRuleViolationForMinConsecutiveDO(nextCheckStart - (time_t)60 * offsetTZMinutes, nextCheckEnd - (time_t)60 * offsetTZMinutes, 0, ruleParam);
				passAllRule = false;
				if (!IsCheckAllRule()) {
					return false;
				}
			}
			nextCheckStart = nextCheckEnd + (time_t)24 * 3600;
			nextCheckEnd = nextCheckStart + (time_t)consecutiveDays * 24 * 3600;
		}
	}

	return passAllRule;
}

vector<time_t> LimitDutyDaysOffForHXRule::GetDaysOffDates(const std::vector<const ROSTER*>& rosters, const unordered_map<time_t, std::shared_ptr<CREW_MANDAY_BASIC>>& crewMandayMap, const time_t checkedStartTime, const time_t checkedEndTime, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const LimitDutyDaysOffForHXRuleParam& ruleParam) const {
	auto& dayOffDefineEx = _dayOffDefinition.getReqExRow();

	vector<time_t> daysOffFromManday = GetDaysOffFromManday(rosters, crew, checkedStartTime, checkedEndTime, offsetTZMinutes, dayOffDefineEx.isBlankDayCountedDO, ruleParam);

	vector<std::tuple<time_t, time_t>> dayOffPeriods = _dayOffDefinition.getDaysOffPeriodsByRoster(rosters, crewMandayMap, this->_dbData, checkedStartTime, checkedEndTime, offsetTZMinutes);
	vector<time_t> daysOffFromRosters = _dayOffDefinition.getDaysOffDates(dayOffPeriods);

	//allDaysOffDates存储所有拥有DDO日期列表
	vector<time_t> allDaysOffDates = daysOffFromManday;
	allDaysOffDates.insert(allDaysOffDates.end(), daysOffFromRosters.begin(), daysOffFromRosters.end());
	sort(allDaysOffDates.begin(), allDaysOffDates.end());
	allDaysOffDates.erase(std::unique(allDaysOffDates.begin(), allDaysOffDates.end()), allDaysOffDates.end());
	//sort(allDaysOffDates.begin(), allDaysOffDates.end());
	return allDaysOffDates;
}

bool LimitDutyDaysOffForHXRule::HasConsecutiveDDO(int &firstConsecutiveStartIndex, int& firstConsecutiveEndIndex, const vector<time_t>& allDaysOffDates, const time_t startTimeLoc, const time_t endTimeLoc, const LimitDutyDaysOffForHXRuleParam& ruleParam) const {
	int consecutiveTimes = 0;//DDO连续次数
	for (int i = 0; i < (int)allDaysOffDates.size() - 1; i++) {
		if (allDaysOffDates[i] < startTimeLoc || allDaysOffDates[i] >= endTimeLoc) {
			continue;
		}
		if (allDaysOffDates[i] + 86400 == allDaysOffDates[(size_t)i + 1]) {
			consecutiveTimes++;
			if (consecutiveTimes == 1) {
				firstConsecutiveStartIndex = i;
			}
		}
		else {
			if ((consecutiveTimes + 1) >= *ruleParam._minConsecutiveDO) {
				return true;
			}
			consecutiveTimes = 0;
		}
		if (ruleParam._minConsecutiveDO != nullptr) {
			firstConsecutiveEndIndex = i + 1;//存在连续多个DDO返回最后一个DDO的索引
		}
	}
	return (consecutiveTimes + 1) >= *ruleParam._minConsecutiveDO;
}

bool LimitDutyDaysOffForHXRule::MatchChildRuleParam(const std::vector<const ROSTER*>& rosters, const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const time_t lastDayStartTimeUtc, const int offsetTZMinutes, const LimitDutyDaysOffForHXRuleParam& childRuleParam) const {
	bool matched = false;

	for (size_t i = 0; i < rosters.size(); i++) {
		ROSTER* currRoster = const_cast<ROSTER*>(rosters[i]);

		if (!IsLastDayTask(currRoster, lastDayStartTimeUtc)) {
			//不是最后一天的Roster则忽略掉
			continue;
		}

		if (MatchDHDAndCrewAgreeWorkLastDay(currRoster, lastDayStartTimeUtc, childRuleParam)) {
			matched = true;
			break;
		}
	}
	return matched;
}

bool LimitDutyDaysOffForHXRule::MatchDHDAndCrewAgreeWorkLastDay(const ROSTER* lastDayRoster, const time_t lastDayStartTimeUtc, const LimitDutyDaysOffForHXRuleParam& ruleParam) const {
	if (ruleParam._isDHDLastDay == nullptr || ruleParam._isCrewAgreeWork == nullptr) {
		return false;
	}

	if (*ruleParam._isDHDLastDay && *ruleParam._isCrewAgreeWork) {
		if (!IsCrewAgreeWork(lastDayRoster, lastDayStartTimeUtc)) {
			return false;
		}

		if (!IsOnlyDHD(lastDayRoster, lastDayStartTimeUtc + (time_t)(24 * 3600))) {
			return false;
		}
	}
	else if (*ruleParam._isDHDLastDay) {
		if (!IsOnlyDHD(lastDayRoster, lastDayStartTimeUtc)) {
			return false;
		}
	}
	else if (*ruleParam._isCrewAgreeWork) {
		if (!IsCrewAgreeWork(lastDayRoster, lastDayStartTimeUtc)) {
			return false;
		}
	}
	return true;
}

bool LimitDutyDaysOffForHXRule::IsLastDayTask(const ROSTER* currRoster, const time_t lastDayStartTimeUtc) const {
	time_t checkStartTimeUtc = lastDayStartTimeUtc;
	time_t checkEndTimeUtc = lastDayStartTimeUtc + (time_t)(24 * 3600);

	if (currRoster->actRestStrUtc >= checkStartTimeUtc && currRoster->actStrUtc < checkEndTimeUtc) {
		return true;
	}
	return false;
}

bool LimitDutyDaysOffForHXRule::IsCrewAgreeWork(const ROSTER* lastDayRoster, const time_t lastDayStartTimeUtc) const {
	time_t checkStartTimeUtc = lastDayStartTimeUtc;
	time_t checkEndTimeUtc = lastDayStartTimeUtc + (time_t)(24 * 3600);

	if (lastDayRoster->pairing == nullptr) {
		return lastDayRoster->isAgreeWork;
	}
	else {
		for (auto& duty : lastDayRoster->pairing->getDutyVec()) {
			for (auto& segment : duty->getSegmentsRead()) {
				if (segment->getEndTimeUtcAct() >= checkStartTimeUtc && segment->getStartTimeUtcAct() < checkEndTimeUtc) {
					auto rf = _dbData->rosterFlightMgr.get(segment->getDBId(), lastDayRoster->idcrew);
					return rf == nullptr ? false : rf->isAgreeWork;
				}
			}
		}
	}
	return false;
}

bool LimitDutyDaysOffForHXRule::IsOnlyDHD(const ROSTER* lastDayRoster, const time_t lastDayStartTimeUtc) const {
	time_t checkStartTimeUtc = lastDayStartTimeUtc;
	time_t checkEndTimeUtc = lastDayStartTimeUtc + (time_t)(24 * 3600);

	if (lastDayRoster->pairing == nullptr) {
		return false;
	}
	else {
		Duty* duty = (Duty*)lastDayRoster->pairing->getFirstDuty();
		for (auto& segment : duty->getSegmentsRead()) {
			if (segment->getAssignment() != "DHD"
				&& (segment->getEndTimeUtcAct() >= checkStartTimeUtc && segment->getStartTimeUtcAct() < checkEndTimeUtc)) {
				return false;
			}
		}
	}
	return true;
}

int LimitDutyDaysOffForHXRule::ExcludingDaysOffNum(const ROSTER* prevWorkRoster, const ROSTER* currWorkRoster, const LimitDutyDaysOffForHXRuleParam& ruleParam) const {
	//連續28天必須有7個DDO，這7個DDO不能是恢復6個以上時差適應狀態的第一個DDO
	if (prevWorkRoster == nullptr || prevWorkRoster->pairing == nullptr 
		|| currWorkRoster == nullptr || currWorkRoster->pairing == nullptr
		|| ruleParam._excludingFirstRecovery6OffsetdDo == nullptr) {
		return 0;
	}
	if (!*ruleParam._excludingFirstRecovery6OffsetdDo) {
		return 0;
	}
	string prevAccState = prevWorkRoster->pairing->getLastDuty()->getAcclimatisedState();
	string currAccState = currWorkRoster->pairing->getFirstDuty()->getAcclimatisedState();
    int tzDiff = GetAccStateTimeZoneDiff(prevWorkRoster->pairing->getLastDuty());
    //6個以上時差
	if (prevAccState == "U" && currAccState == "A" && tzDiff >= 6*60)	 {
		return 1;
	}
	return 0;
}

vector<time_t> LimitDutyDaysOffForHXRule::GetDaysOffFromManday(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, 
		const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const int offsetTZMinutes, 
		const bool isCountBlankDay, const LimitDutyDaysOffForHXRuleParam& ruleParam) const {

	vector<time_t> daysOffDateInManday;//记录Manday中的DDO日期

	time_t rostersStartDayLoc = this->_dbData->scenario.startDtUTC + (time_t)offsetTZMinutes * 60;
	time_t rostersEndDayLoc = this->_dbData->scenario.endDtUTC + (time_t)offsetTZMinutes * 60;
	if (!rosters.empty()) {
		rostersStartDayLoc = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[0]->getStartTimeLocAct(), 0);
		rostersEndDayLoc = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[rosters.size() - 1]->getRestStartLocAct(), 0) + 86400 - 1;
	}

	time_t rangeStartTimeLoc = rangeStartTimeUtc + (time_t)(offsetTZMinutes * 60);
	time_t rangeEndTimeLoc = rangeEndTimeUtc + (time_t)(offsetTZMinutes * 60);
	if (crew->division == "P") 
	{
		for (size_t i = 0; i < crew->mandayFdList.size(); i++) {
			std::shared_ptr<CREW_MANDAY_BASIC> prevManday = (i == 0 ? nullptr : crew->mandayFdList[i-1]);
			std::shared_ptr<CREW_MANDAY_BASIC> currManday = crew->mandayFdList[i];	
			vector<time_t> tmpDaysOffDateInManday = GetDaysOffFromManday(prevManday, currManday, rostersStartDayLoc, rostersEndDayLoc, rangeStartTimeLoc, rangeEndTimeLoc, isCountBlankDay, ruleParam);
			daysOffDateInManday.insert(daysOffDateInManday.end(), tmpDaysOffDateInManday.begin(), tmpDaysOffDateInManday.end());
		}
	}
	else {
		for (size_t i = 0; i < crew->mandayCcAmList.size(); i++) {
			std::shared_ptr<CREW_MANDAY_BASIC> prevManday = (i == 0 ? nullptr : crew->mandayCcAmList[i-1]);
			std::shared_ptr<CREW_MANDAY_BASIC> currManday = crew->mandayCcAmList[i];
			vector<time_t> tmpDaysOffDateInManday = GetDaysOffFromManday(prevManday, currManday, rostersStartDayLoc, rostersEndDayLoc, rangeStartTimeLoc, rangeEndTimeLoc, isCountBlankDay, ruleParam);
			daysOffDateInManday.insert(daysOffDateInManday.end(), tmpDaysOffDateInManday.begin(), tmpDaysOffDateInManday.end());
		}
	}

	return daysOffDateInManday;
}

bool LimitDutyDaysOffForHXRule::CheckDaysOffFromLayoverGroundRosters(const vector<ROSTER*>& layoverGroundRosters, const int offsetTZMinutes, const LimitDutyDaysOffForHXRuleParam& ruleParam) const {
	bool valid = false;

	if (ruleParam._minConsecutiveDO != nullptr) {
		//当前检查周期满足要求，则退出检查
		int consecutiveDO = 0;//连续EXB/DO数量
		for (size_t i = 0; i < layoverGroundRosters.size(); i++) {
			auto currRoster = layoverGroundRosters[i];
			auto nextRoster = i < layoverGroundRosters.size() - 1 ? layoverGroundRosters[i + 1] : nullptr;
			if (nextRoster == nullptr) continue;

			time_t currEndUtc = currRoster->actRestStrUtc;
			time_t nextStartUtc = nextRoster->actStrUtc;

			if (fabs(currEndUtc - nextStartUtc) <= 60) { //二个任务间隔小于等于60秒，认为是连续
				//连续DO
				consecutiveDO++;
			}

			if (consecutiveDO >= *ruleParam._minConsecutiveDO) {
				//当前检查周期满足要求，则退出检查
				valid = true;
			}
		}
	}

	int totalDaysOff = layoverGroundRosters.size();
	if (ruleParam._minDO != nullptr && totalDaysOff >= *ruleParam._minDO) {
		//当前检查周期满足要求，则退出检查
		valid = true;
	}
	return valid;
}

vector<time_t> LimitDutyDaysOffForHXRule::GetDaysOffFromManday(const std::shared_ptr<CREW_MANDAY_BASIC>& prevManday, const std::shared_ptr<CREW_MANDAY_BASIC>& currManday, 
	const time_t rostersStartDayLoc, const time_t rostersEndDayLoc, const time_t rangeStartTimeLoc, const time_t rangeEndTimeLoc, 
	const bool isCountBlankDay, const LimitDutyDaysOffForHXRuleParam& ruleParam) const {
	vector<time_t> daysOffDateInManday;//记录Manday中的DDO日期
	if ((currManday->dateLoc >= rangeStartTimeLoc && currManday->dateLoc <  rostersStartDayLoc) 
		|| (currManday->dateLoc < rangeEndTimeLoc && currManday->dateLoc >  rostersEndDayLoc)) { 
		//currManday在rosters时间范围外，在rangeStartTimeLoc到rangeEndTimeLoc之间，统计DDO数量

		if (isCountBlankDay) {
			//空白天算DDO（可能存在问题不满足DDO定义，需要根据实际情况调整）
			time_t prevMandayLoc = rangeStartTimeLoc;
			if (prevManday != nullptr && 
					((prevManday->dateLoc >= rangeStartTimeLoc && prevManday->dateLoc <  rostersStartDayLoc) 
					|| (prevManday->dateLoc < rangeEndTimeLoc && prevManday->dateLoc >  rostersEndDayLoc))) {
				prevMandayLoc = prevManday->dateLoc;
			}

			for(time_t dayOffDate = prevMandayLoc + 86400; dayOffDate < currManday->dateLoc; dayOffDate += 86400) {
				daysOffDateInManday.emplace_back(dayOffDate);
			}
		}
		
		if (currManday->DAY_OFF == DAY_OFF_EXIST) {
			if (ruleParam._excludingFirstRecovery6OffsetdDo) {
				if (!currManday->isFirstRecy6Offsetddo)	daysOffDateInManday.emplace_back(currManday->dateLoc);
			}
			else {
				daysOffDateInManday.emplace_back(currManday->dateLoc);
			}
		}
	}
	return daysOffDateInManday;
}

int LimitDutyDaysOffForHXRule::GetAccStateTimeZoneDiff(const Duty* prevDuty) const {
	string prevDutyDepZoneId = _dbData->getAirportZoneId(prevDuty->getDepStation());
	string prevDutyArrZoneId = _dbData->getAirportZoneId(prevDuty->getArrStation());
	int displacementTime = TimezoneUtils::abs(TimezoneUtils::GetTimezoneOffset(prevDuty->getStartTimeUtcAct(), prevDutyDepZoneId, prevDuty->getEndTimeUtcAct(), prevDutyArrZoneId));
	return displacementTime;
}

int LimitDutyDaysOffForHXRule::GetEndTimeGapInSec(const ROSTER* roster) const {
	if (roster->pairing == nullptr) {
		return RosterUtils::GetEndTimeGapInSec(roster, "ACT");
	}
	return RosterUtils::GetEndTimeGapInSec(roster->pairing->getLastSegment(), "ACT");
}

bool LimitDutyDaysOffForHXRule::IgnoreCheck(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const time_t startTimeUtc, const time_t endTimeUtc, const int offsetTZMinutes) const {
	time_t rostersStartDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[0]->getStartTimeLocAct(), 0);
	time_t rostersEndDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[rosters.size() - 1]->getRestStartLocAct(), 0) + 86400 - 1;

	//在Rosters时间段之外需要检查的数据，使用manday判断是否存在工作任务
	time_t startTimeLoc = startTimeUtc + (time_t)offsetTZMinutes * 60;
	time_t endTimeLoc = endTimeUtc + (time_t)offsetTZMinutes * 60;
	const auto& mandayFds = crew->mandayFdList;
	const auto& mandayCcAm = crew->mandayCcAmList;
	bool isFd = crew->division == "P";
	if (isFd) {
		for (size_t i = 0; i < mandayFds.size(); i++) {
			const auto& manday = mandayFds[i];
			if (manday->dateLoc > rostersEndDay) break;
			if ((manday->dateLoc >= startTimeLoc && manday->dateLoc < rostersStartDay) || (manday->dateLoc < endTimeLoc && manday->dateLoc > rostersEndDay)) {
				if (manday->dp > 0) {
					//存在工作任务
					return false;
				}
			}
		}
	}
	else {
		for (size_t m = 0; m < mandayCcAm.size(); m++) {
			const auto& manday = mandayCcAm[m];
			if (manday->dateLoc > rostersEndDay) break;
			if ((manday->dateLoc >= startTimeLoc && manday->dateLoc < rostersStartDay) || (manday->dateLoc < endTimeLoc && manday->dateLoc > rostersEndDay)) {
				if (manday->dp > 0) {
					//存在工作任务
					return false;
				}
			}
		}
	}

	//检查Roster
	for (auto& roster : rosters) {
		if (roster->restStrUtc >= startTimeUtc && roster->actStrUtc < endTimeUtc) {
			if (!RuleParams::GetInstancePtr()->isRestAssignment(roster->qualifier, roster->duty)) {
				return false;
			}
		}
	}
	return true;
}

void LimitDutyDaysOffForHXRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitDutyDaysOffForHXRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

	auto it = input.dependDbRules.find(RULES::ANR_DAY_OFF_DEFINITION);
	if (it != input.dependDbRules.end()) {
		_dayOffDefinition.loadFromDbRules(it->second);
	}

	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitDutyDaysOffForHXRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitDutyDaysOffForHXRule::ThrowRuleViolationForMinDO(const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const int totalDaysOff, const LimitDutyDaysOffForHXRuleParam& ruleParam) const {
	//连续n天不满足DO数量
	string msg = "The number of days off ({0:totalDaysOff}) must be at least {1:minDO} in {2:consecutiveDays} days. (Work/DHD:{3:isCrewAgreeWork}/{4:isCrewAgreeWork})";
	msg = StringUtils::Format(msg, totalDaysOff, *ruleParam._minDO, ruleParam._consecutiveDays, 
		ruleParam._isCrewAgreeWork == nullptr ? "N" : (*ruleParam._isCrewAgreeWork ? "Y" : "N"), 
		ruleParam._isDHDLastDay == nullptr ? "N" : (*ruleParam._isDHDLastDay ? "Y" : "N"));

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
	rv->operation_result.insert(pair<string, string>("totalDaysOff", std::to_string(totalDaysOff)));
	rv->operation_result.insert(pair<string, string>("minDO", std::to_string(*ruleParam._minDO)));
	rv->operation_result.insert(pair<string, string>("consecutiveDays", std::to_string((ruleParam._consecutiveDays))));

	_ruleViolation.AddRuleViolations(rv);
}

void LimitDutyDaysOffForHXRule::ThrowRuleViolationForMinConsecutiveDO(const time_t rangeStartTimeUtc, const time_t rangeEndTimeUtc, const int maxDaysOffInRest, const LimitDutyDaysOffForHXRuleParam& ruleParam) const {
	//连续n天不满足DO数量
	string msg = "The number of consecutive days off ({0:maxDaysOffInRest}) must be at least {1:minDO} in {2:consecutiveDays} days. (Work/DHD:{3:isCrewAgreeWork}/{4:isCrewAgreeWork})";
	msg = StringUtils::Format(msg, maxDaysOffInRest, *ruleParam._minConsecutiveDO, ruleParam._consecutiveDays,
		ruleParam._isCrewAgreeWork == nullptr ? "N" : (*ruleParam._isCrewAgreeWork ? "Y" : "N"),
		ruleParam._isDHDLastDay == nullptr ? "N" : (*ruleParam._isDHDLastDay ? "Y" : "N"));
	
	if (ruleParam._followingStartOfDDO != nullptr && *ruleParam._followingStartOfDDO) {
		//针对连续14天2个连续DDO特殊处理告警信息
		msg = "The number of consecutive days off must be at least {0:minDO} in {1:consecutiveDays} days.";
		msg = StringUtils::Format(msg, *ruleParam._minConsecutiveDO, ruleParam._consecutiveDays);
	}

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
	rv->operation_result.insert(pair<string, string>("maxDaysOffInRest", std::to_string(maxDaysOffInRest)));
	rv->operation_result.insert(pair<string, string>("minConsecutiveDO", std::to_string(*ruleParam._minConsecutiveDO)));
	rv->operation_result.insert(pair<string, string>("consecutiveDays", std::to_string((ruleParam._consecutiveDays))));

	_ruleViolation.AddRuleViolations(rv);
}