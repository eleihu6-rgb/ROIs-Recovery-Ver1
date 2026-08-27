/**
 * @file MinODPInPeriodForCcRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "MinODPInPeriodForCcRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "Log/Logger.h"

bool MinODPInPeriodForCcRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;

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

	//stuct tm* localtime(const time_t *timep);
	//获得工作时间
	const std::vector<std::unique_ptr<WorkPeriod>> workPeriods = std::move(WorkPeriod::GetWorkPeriods(rosters, this->_dbData));
	const std::vector<RosterPeriod>& rosterPeriods = GetRosterPeriods();

	if (workPeriods.empty()) {
		return passAllRule;
	}

	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(checkedStartTime, crew, this->GetDataContext());

	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);
		passAllRule = CheckConsecutiveHoursPerPeriod(workPeriods, ruleParam._maxPeriodDays, ruleParam._minConsecutiveHoursPerPeriod, offsetTZMinutes);
		if (passAllRule) {
			passAllRule = CheckConsecutiveNightsPerPeriod(workPeriods, ruleParam._maxPeriodNights,
				ruleParam._minConsecutiveNightsPerPeriod, ruleParam._nightStartTime, ruleParam._nightEndTime, ruleParam._nightMinRestInterval, offsetTZMinutes);
		}
		//if (passAllRule) {
		//	passAllRule = CheckDaysFreeOfDutyPerPeriod(rosters, rosterPeriods, ruleParam._maxRosterPeriod, ruleParam._minDaysFreeOfDuty);
		//}

	}
	//
	////Rest time in Pairing 
	//Duty duty;
	//Duty prevDuty;
	//duty.getMinRest();
	//double dutyRestTime = duty.getStartTimeLocAct() - prevDuty.getEndTimeLocAct();
	//if (dutyRestTime < 36 hour) {
	//	//invalid 
	//}
	////Rest time in Rosters
	//Pairing pairing;
	//Pairing prevPairing;
	//double pairingRestTime = pairing.getStartTimeLocAct() - prevPairing.getEndTimeLocAct();

	//if (duty.getDutyType() == Duty::DUTY_PAIRING_REST || duty.getDutyType() == Duty::DUTY_BLANK_DAY) {
	//	dutyRestTime += duty.getEndTimeLocAct() - duty.getStartTimeLocAct();
	//}
	////for (int i = (int)rosters.size() - 1; i > 0; i++) {
	////	rosters[i]->actEndLoc
	////}

	//time_t rosterRestTime = 0;
	//ROSTER roster;
	//ROSTER prevRoster;
	////RDO、备份日也是休息。
	//if (roster.qualifier == "RDO" || roster.qualifier == "备份日") {
	//	rosterRestTime += roster.getEndTimeLocAct() - roster.getStartTimeLocAct();
	//}
	//rosterRestTime += prevRoster.getEndTimeLocAct() - roster.getStartTimeLocAct();//????? 不可能是完整天
	////time_t rosterRestTime = prevRoster.getEndTimeLocAct() - roster.getStartTimeLocAct();
	
	return passAllRule;
}

std::vector<RosterPeriod>& MinODPInPeriodForCcRule::GetRosterPeriods() const {
	std::vector<RosterPeriod>& rosterPeriods = this->_dbData->rosterPeriodList;
	return rosterPeriods;
}

WindowTime MinODPInPeriodForCcRule::GetWindowTime(const std::vector<const ROSTER*>& rosters) const {
	WindowTime windowTime;
	time_t checkedStartTimeUtc = 0, checkedEndTimeUtc = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		windowTime.SetStartTimeUTC( this->_dbData->scenario.startDtUTC );
		windowTime.SetEndTimeUTC( this->_dbData->scenario.endDtUTC + 24 * 3600 );
	}
	else
	{
		windowTime.SetStartTimeUTC( rosters[0]->actStrUtc );
		windowTime.SetEndTimeUTC( rosters[rosters.size() - 1]->restStrUtc );
	}
	return windowTime;
}

bool MinODPInPeriodForCcRule::IsSlideWindow(const WorkPeriod& workPeriod, const time_t windowStart, const time_t windowEnd, bool isStartTime) const {
	if (isStartTime) {
		//使用开始时间在滚动时间窗口中来判断是否在滑动窗口内是合适
		return workPeriod.GetStartTimeUTC() >= windowStart && workPeriod.GetStartTimeUTC() <= windowEnd;
	}
	//使用结束时间在滚动时间窗口中来判断是否在滑动窗口内是合适
	return workPeriod.GetEndTimeUTC() >= windowStart && workPeriod.GetEndTimeUTC() <= windowEnd;
}

bool MinODPInPeriodForCcRule::CheckConsecutiveHoursPerPeriod(const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods, 
	const unsigned int& maxPeriodDays, const unsigned int& minConsecutiveHoursPerPeriod, const int offsetTZMinutes) const {
	bool isValid = true;

	//转化成分钟
	unsigned int maxPeriodMinutes = maxPeriodDays * 24 * 60; 
	unsigned int minConsecutiveMinutesPerPeriod = minConsecutiveHoursPerPeriod * 60;
	unsigned int windowSlideMinutesSize = 24 * 60; //滑动窗口步长（按天），单位：分钟

	//检查的开始时间和结束时间
	time_t startTime = Utility::GetInstancePtr()->getLocalDayStartInUTC(workPeriods[0]->GetStartTimeUTC(), offsetTZMinutes);
	time_t endTime = Utility::GetInstancePtr()->getLocalDayStartInUTC(workPeriods[workPeriods.size() - 1]->GetEndTimeUTC(), offsetTZMinutes) + (time_t)24 * 60 * 60;

	int startIndex = 0;
	time_t windowSlideSize = windowSlideMinutesSize * 60; //滑动窗口步长（单位秒）(按小时或按天滚动)
	//windowStart 窗口开始时间，windowEnd 窗口结束时间
	for (time_t windowStart = startTime; windowStart < endTime; windowStart += windowSlideSize) {
		time_t windowEnd = windowStart + maxPeriodMinutes * 60;
		
		//检查滑动窗口[windowStart,windowEnd]是否违规
		if (!CheckConsecutiveHoursPerPeriod(startIndex, workPeriods, minConsecutiveMinutesPerPeriod, 
			windowStart, windowEnd, windowSlideSize)) {
			_ruleViolation.SetParam("startTimeUtc", StringUtils::lltos((long long)windowStart));
			_ruleViolation.SetParam("endTimeUtc", StringUtils::lltos((long long)windowEnd));
			_ruleViolation.SetParam("offsetTZMinute", "0");
			_ruleViolation.SetParam("minConsecutiveHours", StringUtils::itos(minConsecutiveHoursPerPeriod));
			_ruleViolation.SetParam("maxPeriodDays", StringUtils::itos(maxPeriodDays));
			//违规则退出
			isValid = false;
			break;
		}
	}
	if (!isValid) {
		ThrowRuleViolationForConsecutiveHours();
	}
	return isValid;
}


bool MinODPInPeriodForCcRule::CheckConsecutiveHoursPerPeriod(int& startIndex, const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods,
	const unsigned int& minConsecutiveMinutesPerPeriod, const time_t& windowStart, const time_t& windowEnd, const time_t& windowSlideSize) const {

	bool isValid = false;

	int maxConsecutiveMinutesPerPeriod = 0;
	//workPeriods.size()是 unsigned int 需要转化成 int，否则负数会溢出变成大正整数
	int firstIndex = -1;//滑动窗口内第一个WorkPeriod在列表中索引
	int lastIndex = -1;//滑动窗口内最后一个WorkPeriod在列表中索引
	for (int i = startIndex; i < (int)workPeriods.size(); i++) {
		auto& currWorkPeriod = workPeriods[i];

		if (currWorkPeriod->GetStartTimeUTC() > windowEnd) {
			//开始时间超出滑动窗口范围，则退出
			break;
		}

		if (!IsSlideWindow(*currWorkPeriod, windowStart, windowEnd, false)) {
			//当前workPeriod结束时间，不在滚动窗口范围内则忽略掉
			continue;
		}

		if (windowStart <= currWorkPeriod->GetEndTimeUTC()
			&& currWorkPeriod->GetEndTimeUTC() <= (windowStart + windowSlideSize)) {
			//设置下次滑动时，开始索引位置。减少不必要的重复判断。
			startIndex = i;
		}

		if (firstIndex == -1) {
			firstIndex = i;
		}
		lastIndex = i;

		if (i >= (int)workPeriods.size() - 1) {
			//当前最后一个元素，直接退出
			break;
		}

		auto& nextWorkPeriod = workPeriods[i + 1];

		int consecutiveMinutesPerPeriod = static_cast<int>(nextWorkPeriod->GetStartTimeUTC() - currWorkPeriod->GetEndTimeUTC()) / 60;
		if (consecutiveMinutesPerPeriod < 0) {
			//Logger::getRuleLogger()->debug("Work period overlaps, duration:{}s. nextWorkPeriod:{},{}, currWorkPeriod:{},{}", 
			//	consecutiveMinutesPerPeriod, 
			//	GetWorkTypeEnumName(nextWorkPeriod->GetWorkType()), nextWorkPeriod->GetKey(),
			//	GetWorkTypeEnumName(currWorkPeriod->GetWorkType()), currWorkPeriod->GetKey());
			continue;
		}
		if (consecutiveMinutesPerPeriod > maxConsecutiveMinutesPerPeriod) {
			maxConsecutiveMinutesPerPeriod = consecutiveMinutesPerPeriod;
		}
		if (consecutiveMinutesPerPeriod >= (int)minConsecutiveMinutesPerPeriod) {
			isValid = true;
			break;
		}
	}

	if (!isValid && firstIndex >= 0) {
		//判断第一个工作周期与滑动窗口结束时间之间的休息时间
		auto& firstWorkPeriod = workPeriods[firstIndex];
		int consecutiveMinutesPerPeriod = static_cast<int>(firstWorkPeriod->GetStartTimeUTC() - windowStart) / 60;
		if (consecutiveMinutesPerPeriod > maxConsecutiveMinutesPerPeriod) {
			maxConsecutiveMinutesPerPeriod = consecutiveMinutesPerPeriod;
		}
		if (consecutiveMinutesPerPeriod >= (int)minConsecutiveMinutesPerPeriod) {
			isValid = true;
		}
	}

	if (!isValid && lastIndex >= 0) {
		//判断最后一个工作周期与滑动窗口结束时间之间的休息时间
		auto& lastWorkPeriod = workPeriods[lastIndex];
		int consecutiveMinutesPerPeriod = static_cast<int>(windowEnd - lastWorkPeriod->GetEndTimeUTC()) / 60;
		if (consecutiveMinutesPerPeriod > maxConsecutiveMinutesPerPeriod) {
			maxConsecutiveMinutesPerPeriod = consecutiveMinutesPerPeriod;
		}
		if (consecutiveMinutesPerPeriod >= (int)minConsecutiveMinutesPerPeriod) {
			isValid = true;
		}
	}

	if (!isValid && (firstIndex == -1 || lastIndex == -1)) {
		//滑动窗口都是休息
		isValid = true;
		maxConsecutiveMinutesPerPeriod = -1; //无意义
	}
	_ruleViolation.SetParam("maxConsecutiveHours", StringUtils::itos(maxConsecutiveMinutesPerPeriod/60));
	return isValid;
}

bool MinODPInPeriodForCcRule::CheckConsecutiveNightsPerPeriod(const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods, 
	const unsigned int& maxPeriodNights, const unsigned int& minConsecutiveNightsPerPeriod, 
	const std::string& nightStartTime, const std::string& nightEndTime, const string& nightMinRestInterval, const int offsetTZMinutes) const {
	bool isValid = true;

	if (nightStartTime.empty() || nightEndTime.empty()) {
		return isValid;
	}

	//转化成分钟
	unsigned int maxPeriodMinutes = maxPeriodNights * 24 * 60;
	unsigned int windowSlideMinutesSize = 24 * 60; //滑动窗口步长（按天），单位：分钟

	//检查的开始时间和结束时间
	time_t startTime = Utility::GetInstancePtr()->getLocalDayStartInUTC(workPeriods[0]->GetStartTimeUTC(), offsetTZMinutes);
	time_t endTime = Utility::GetInstancePtr()->getLocalDayStartInUTC(workPeriods[workPeriods.size() - 1]->GetEndTimeUTC(), offsetTZMinutes) + (time_t)24 * 60 * 60;

	int startIndex = 0;
	time_t windowSlideSize = windowSlideMinutesSize * 60; //滑动窗口步长（单位秒）(按小时或按天滚动)
	//windowStart 窗口开始时间，windowEnd 窗口结束时间
	for (time_t windowStart = startTime; windowStart < endTime; windowStart += windowSlideSize) {
		time_t windowEnd = windowStart + maxPeriodMinutes * 60;

		//检查滑动窗口[windowStart,windowEnd]是否违规
		if (!CheckConsecutiveNightsPerPeriod(startIndex, workPeriods, minConsecutiveNightsPerPeriod, nightStartTime, nightEndTime, nightMinRestInterval,
			windowStart, windowEnd, windowSlideSize)) {
			_ruleViolation.SetParam("startTimeUtc", StringUtils::lltos((long long)windowStart));
			_ruleViolation.SetParam("endTimeUtc", StringUtils::lltos((long long)windowEnd));
			_ruleViolation.SetParam("offsetTZMinute", "0");
			_ruleViolation.SetParam("minConsecutiveNights", StringUtils::itos(minConsecutiveNightsPerPeriod));
			_ruleViolation.SetParam("maxPeriodNights", StringUtils::itos(maxPeriodNights));

			//违规则退出
			isValid = false;
			break;
		}
	}
	if (!isValid) {
		ThrowRuleViolationForConsecutiveNights();
	}
	return isValid;
}

bool MinODPInPeriodForCcRule::CheckConsecutiveNightsPerPeriod(int startIndex, const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods,
	const unsigned int& minConsecutiveNightsPerPeriod, 
	const std::string& nightStartTimeHHmm, const std::string& nightEndTimeHHmm, const string& nightMinRestInterval,
	const time_t& windowStart, const time_t& windowEnd, const time_t& windowSlideSize) const {
	
	bool isValid = false;
	unsigned int consecutiveNights = 0;
	std::shared_ptr<RestPeriod> prevRestPeriod;
	int firstIndex = -1;//滑动窗口内第一个WorkPeriod在列表中索引
	int lastIndex = -1;//滑动窗口内最后一个WorkPeriod在列表中索引
	//workPeriods.size()是 unsigned int 需要转化成 int，否则负数会溢出变成大正整数
	for (int i = startIndex; i < (int)workPeriods.size(); i++) {
		auto& currWorkPeriod = workPeriods[i];

		if (currWorkPeriod->GetStartTimeUTC() > windowEnd) {
			//开始时间超出滑动窗口范围，则退出
			break;
		}

		if (!IsSlideWindow(*currWorkPeriod, windowStart, windowEnd, false)) {
			//当前workPeriod结束时间，不在滚动窗口范围内则忽略掉
			continue;
		}

		if (windowStart <= currWorkPeriod->GetEndTimeUTC()
			&& currWorkPeriod->GetEndTimeUTC() <= (windowStart + windowSlideSize)) {
			//设置下次滑动时，开始索引位置。减少不必要的重复判断。
			startIndex = i;
		}

		if (firstIndex == -1) {
			firstIndex = i;
		}
		lastIndex = i;

		if (i >= (int)workPeriods.size() - 1) {
			//当前最后一个元素，直接退出
			break;
		}

		auto& nextWorkPeriod = workPeriods[i + 1];

		std::shared_ptr<RestPeriod> restPeriod(new RestPeriod());
		restPeriod->SetStartTimeUTC(currWorkPeriod->GetEndTimeUTC());
		restPeriod->SetEndTimeUTC(nextWorkPeriod->GetStartTimeUTC());
		restPeriod->SetStartTimeLoc(currWorkPeriod->GetEndTimeLoc());
		restPeriod->SetEndTimeLoc(nextWorkPeriod->GetStartTimeLoc());

		int localNightNums = DutyUtils::GetLocalNightNums(restPeriod->GetStartTimeLoc(), restPeriod->GetEndTimeLoc(),
			nightStartTimeHHmm, nightEndTimeHHmm, nightMinRestInterval);
		if (localNightNums >= (int)minConsecutiveNightsPerPeriod) {
			consecutiveNights = localNightNums;
			isValid = true;
			break;
		}

		if (prevRestPeriod == nullptr) {
			prevRestPeriod = restPeriod;
			consecutiveNights = localNightNums;
		}
		else {
			//判断二个休息日历天是否连续,若连续的则可以累计成连续夜晚次数
			consecutiveNights = GetConsecutiveLocalNight(prevRestPeriod, restPeriod, consecutiveNights, localNightNums);
			if (consecutiveNights >= minConsecutiveNightsPerPeriod) {
				isValid = true;
				break;
			}
			prevRestPeriod = restPeriod;
		}
	}

	if (!isValid && firstIndex >= 0) {
		//判断第一个工作周期与滑动窗口结束时间之间的休息时间
		auto& firstWorkPeriod = workPeriods[firstIndex];
		std::shared_ptr<RestPeriod> restPeriod(new RestPeriod());
		restPeriod->SetStartTimeUTC(windowStart);
		restPeriod->SetEndTimeUTC(firstWorkPeriod->GetStartTimeUTC());
		restPeriod->SetStartTimeLoc(windowStart + (firstWorkPeriod->GetStartTimeLoc() - firstWorkPeriod->GetStartTimeUTC()));
		restPeriod->SetEndTimeLoc(firstWorkPeriod->GetStartTimeLoc());

		int localNightNums = DutyUtils::GetLocalNightNums(restPeriod->GetStartTimeLoc(), restPeriod->GetEndTimeLoc(),
			nightStartTimeHHmm, nightEndTimeHHmm, nightMinRestInterval);
		if (localNightNums >= (int)minConsecutiveNightsPerPeriod) {
			consecutiveNights = localNightNums;
			isValid = true;
		}

		//若最后一个休息不满足时，在判断与前一个休息累计是否满足
		if (!isValid) {
			//判断二个休息日历天是否连续,若连续的则可以累计成连续夜晚次数
			consecutiveNights = GetConsecutiveLocalNight(restPeriod, prevRestPeriod, consecutiveNights, localNightNums);
			if (consecutiveNights >= (int)minConsecutiveNightsPerPeriod) {
				isValid = true;
			}
		}
	}

	if (!isValid && lastIndex >= 0) {
		//判断最后一个工作周期与滑动窗口结束时间之间的休息时间
		auto& lastWorkPeriod = workPeriods[lastIndex];
		std::shared_ptr<RestPeriod> restPeriod(new RestPeriod());
		restPeriod->SetStartTimeUTC(lastWorkPeriod->GetEndTimeUTC());
		restPeriod->SetEndTimeUTC(windowEnd);
		restPeriod->SetStartTimeLoc(lastWorkPeriod->GetEndTimeLoc());
		restPeriod->SetEndTimeLoc(windowEnd + (lastWorkPeriod->GetEndTimeLoc() - lastWorkPeriod->GetEndTimeUTC()));

		int localNightNums = DutyUtils::GetLocalNightNums(restPeriod->GetStartTimeLoc(), restPeriod->GetEndTimeLoc(),
			nightStartTimeHHmm, nightEndTimeHHmm, nightMinRestInterval);
		if (localNightNums >= (int)minConsecutiveNightsPerPeriod) {
			consecutiveNights = localNightNums;
			isValid = true;
		}

		//若最后一个休息不满足时，在判断与前一个休息累计是否满足
		if (!isValid) {
			//判断二个休息日历天是否连续,若连续的则可以累计成连续夜晚次数
			consecutiveNights = GetConsecutiveLocalNight(prevRestPeriod, restPeriod, consecutiveNights, localNightNums);
			if (consecutiveNights >= (int)minConsecutiveNightsPerPeriod) {
				isValid = true;
			}
		}
	}

	if (!isValid && (firstIndex == -1 || lastIndex == -1)) {
		//滑动窗口都是休息
		isValid = true;
		consecutiveNights = -1; //无意义
	}

	_ruleViolation.SetParam("maxConsecutiveNights", StringUtils::itos(consecutiveNights));
	return isValid;
}

bool MinODPInPeriodForCcRule::MatchLocalNight(const std::shared_ptr<RestPeriod>& restPeriod, 
	const std::string& nightStartTimeHHmm, const std::string& nightEndTimeHHmm) const {
	time_t nightStartTime, nightEndTime;
	TimeUtils::GetAbsoluteTime(nightStartTime, nightEndTime, restPeriod->GetStartTimeLoc(), nightStartTimeHHmm, nightEndTimeHHmm);
	return restPeriod->GetStartTimeLoc() <= nightStartTime  && restPeriod->GetEndTimeLoc() >= nightEndTime;
}

unsigned int MinODPInPeriodForCcRule::GetConsecutiveLocalNight(const std::shared_ptr<RestPeriod>& prevRestPeriod, 
	const std::shared_ptr<RestPeriod>& restPeriod, 
	const unsigned int consecutiveNightsBefore, const unsigned int localNightNums) const {
	if (prevRestPeriod == nullptr || restPeriod == nullptr) {
		return localNightNums;
	}
	time_t prevRestDay = TimeUtils::Truncate(prevRestPeriod->GetEndTimeLoc(), ChronoUnit::DAYS);
	time_t restDay = TimeUtils::Truncate(restPeriod->GetStartTimeLoc(), ChronoUnit::DAYS);
	int diffDay = TimeUtils::DiffDay(prevRestDay, restDay);
	if (diffDay <= 1) {
		//前后二个休息日期是连续的，则合并本地夜晚数量
		return consecutiveNightsBefore + localNightNums;
	}
	//前后二个休息日期不连续的，则返回当前本地夜晚数量，重新进行累计
	return localNightNums;
}

bool MinODPInPeriodForCcRule::CheckDaysFreeOfDutyPerPeriod(const std::vector<const ROSTER*>& rosters,
	const std::vector<RosterPeriod>& rosterPeriods,
	const unsigned int& maxRosterPeriod, const unsigned int& minDaysFreeOfDuty) const {
	bool isValid = true;
	const std::map<RosterPeriod*, std::vector<const ROSTER*>> rostersInPeriodMap = GetRostersInPeriod(rosters, rosterPeriods);
	for (auto& rostersInPeriodPair : rostersInPeriodMap) {
		if (!CheckDaysFreeOfDutyInPeriod(rostersInPeriodPair.second, maxRosterPeriod, minDaysFreeOfDuty)) {
			_ruleViolation.SetParam("startTimeUtc", StringUtils::lltos((long long)rostersInPeriodPair.first->rp_start));
			_ruleViolation.SetParam("endTimeUtc", StringUtils::lltos((long long)rostersInPeriodPair.first->rp_end));
			_ruleViolation.SetParam("offsetTZMinute", "0");

			_ruleViolation.SetParam("minDaysFreeOfDuty", StringUtils::itos(minDaysFreeOfDuty));
			_ruleViolation.SetParam("maxRosterPeriod", StringUtils::itos(maxRosterPeriod));

			isValid = false;
			break;
		}
	}
	if (!isValid) {
		ThrowRuleViolationForDaysFreeOfDuty();
	}
	return isValid;
}

bool MinODPInPeriodForCcRule::CheckDaysFreeOfDutyInPeriod(const std::vector<const ROSTER*>& rostersInPeriod,
	const unsigned int& maxRosterPeriod, const unsigned int& minDaysFreeOfDuty) const {
	bool isValid = false;
	//TODO 如何判断违规 by hexd
	int maxDaysFreeOfDuty = 0;
	int daysFreeOfDuty = 0;
	time_t rosterRestTime = 0;
	const ROSTER* prevRoster = nullptr;
	for (auto& roster : rostersInPeriod) {
		if (prevRoster != nullptr) {
			rosterRestTime += const_cast<ROSTER*>(roster)->getStartTimeUtcAct() - const_cast<ROSTER*>(prevRoster)->getEndTimeUtcAct();
			//获得ROD的天数？？？？
			daysFreeOfDuty += GetDaysFreeOfDuty(const_cast<ROSTER*>(prevRoster)->getEndTimeLocAct(), const_cast<ROSTER*>(roster)->getStartTimeLocAct());// ???  
		}
		//|| roster->qualifier
		if (IsRestAssignment(roster->qualifier)) {
			rosterRestTime += const_cast<ROSTER*>(roster)->getEndTimeUtcAct() - const_cast<ROSTER*>(roster)->getStartTimeUtcAct();
			daysFreeOfDuty++;// ??? 
		}
		prevRoster = roster;
		if (daysFreeOfDuty > maxDaysFreeOfDuty) {
			maxDaysFreeOfDuty = daysFreeOfDuty;
		}
		if (daysFreeOfDuty >= (int)minDaysFreeOfDuty) {
			isValid = true;
			break;
		}
	}
	_ruleViolation.SetParam("maxDaysFreeOfDuty", StringUtils::itos(maxDaysFreeOfDuty));
	return isValid;
}

bool MinODPInPeriodForCcRule::IsRestAssignment(const std::string& assignment) const {
	//TODO by hexd 需要调整
	return assignment == "RDO" || assignment.substr(0,3) == "SBY";
}

int MinODPInPeriodForCcRule::GetDaysFreeOfDuty(const time_t& startTime, const time_t& endTime) const {
	return 0;
}

std::map<RosterPeriod*, std::vector<const ROSTER*>> MinODPInPeriodForCcRule::GetRostersInPeriod(const std::vector<const ROSTER*>& rosters,
	const std::vector<RosterPeriod>& rosterPeriods) const {
	std::map<RosterPeriod*, std::vector<const ROSTER*>> rostersInPeriodsMap;
	for (auto rosterPeriod : rosterPeriods) {
		const std::vector<const ROSTER*> rostersInPeriod = GetRostersInPeriod(rosters, rosterPeriod);
		if (!rostersInPeriod.empty()) {
			rostersInPeriodsMap[&rosterPeriod] = rostersInPeriod;
		}
	}
	return rostersInPeriodsMap;
}

std::vector<const ROSTER*> MinODPInPeriodForCcRule::GetRostersInPeriod(const std::vector<const ROSTER*>& rosters, const RosterPeriod& rosterPeriod) const {
	std::vector<const ROSTER*> resultRosters;
	for (auto& roster : rosters) {
		if (MatchRosterPeriod(roster, rosterPeriod)) {
			resultRosters.push_back(roster);
		}
	}
	return resultRosters;
}

bool MinODPInPeriodForCcRule::MatchRosterPeriod(const ROSTER* roster, const RosterPeriod& rosterPeriod) const {
	//TODO 通过开始时间判断是否合适 comment by hexd。
	return rosterPeriod.rp_start <= const_cast<ROSTER*>(roster)->getStartTimeUtcAct() 
		&& const_cast<ROSTER*>(roster)->getStartTimeUtcAct() <= rosterPeriod.rp_end;
}

//抛出不满足某段时间内连续休息小时告警
void MinODPInPeriodForCcRule::ThrowRuleViolationForConsecutiveHours() const {
	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("startTimeUtc"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("endTimeUtc"), 0);
	time_t offsetTZMinute = StringUtils::stoi(_ruleViolation.GetParam("offsetTZMinute"), 0);

	char startUtcStr[30] = { 0 };
	char endUtcStr[30] = { 0 };
	Utility::GetInstancePtr()->UTCToUTCStr(startUtc + offsetTZMinute * 60, startUtcStr, sizeof(startUtcStr));
	Utility::GetInstancePtr()->UTCToUTCStr(endUtc - 1 + offsetTZMinute * 60, endUtcStr, sizeof(endUtcStr));

	string minConsecutiveHours = _ruleViolation.GetParam("minConsecutiveHours");
	string maxPeriodDays = _ruleViolation.GetParam("maxPeriodDays");
	string maxConsecutiveHours = _ruleViolation.GetParam("maxConsecutiveHours");
	std::string msg = "There must be at least {0:minConsecutiveHours} (>{1:maxConsecutiveHours}) consecutive hours of rest within any {2:maxPeriodDays} consecutive days.";
	msg = StringUtils::Format(msg, minConsecutiveHours, maxConsecutiveHours, maxPeriodDays);
	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;;
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc - 1;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	//OP#1448提供message参数给gantt
	rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
	rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
	rv->operation_result.insert(pair<string, string>("maxConsecutiveHours", maxConsecutiveHours));
	rv->operation_result.insert(pair<string, string>("minConsecutiveHours", minConsecutiveHours));
	rv->operation_result.insert(pair<string, string>("period", maxPeriodDays));
	rv->operation_result.insert(pair<string, string>("period_type", "CD"));//日历日
	_ruleViolation.AddRuleViolations(rv);
}

//抛出不满足某段时间内连续本地夜晚休息告警
void MinODPInPeriodForCcRule::ThrowRuleViolationForConsecutiveNights() const {
	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("startTimeUtc"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("endTimeUtc"), 0);
	time_t offsetTZMinute = StringUtils::stoi(_ruleViolation.GetParam("offsetTZMinute"), 0);

	char startUtcStr[30] = { 0 };
	char endUtcStr[30] = { 0 };
	Utility::GetInstancePtr()->UTCToUTCStr(startUtc + offsetTZMinute * 60, startUtcStr, sizeof(startUtcStr));
	Utility::GetInstancePtr()->UTCToUTCStr(endUtc - 1 + offsetTZMinute * 60, endUtcStr, sizeof(endUtcStr));

	string minConsecutiveNights = _ruleViolation.GetParam("minConsecutiveNights");
	string maxPeriodNights = _ruleViolation.GetParam("maxPeriodNights");
	string maxConsecutiveNights = _ruleViolation.GetParam("maxConsecutiveNights");
	std::string msg = "There must be at least {0:minConsecutiveNights} (>{1:maxConsecutiveNights}) consecutive local nights of rest within any {2:maxPeriodNights} consecutive nights.";
	msg = StringUtils::Format(msg, minConsecutiveNights, maxConsecutiveNights, maxPeriodNights);
	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;;
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	//OP#1448提供message参数给gantt
	rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
	rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
	rv->operation_result.insert(pair<string, string>("maxConsecutiveNights", maxConsecutiveNights));
	rv->operation_result.insert(pair<string, string>("minConsecutiveNights", minConsecutiveNights));
	rv->operation_result.insert(pair<string, string>("period", maxPeriodNights));
	//rv->operation_result.insert(pair<string, string>("period_type", ""));//日历日
	_ruleViolation.AddRuleViolations(rv);
}

//抛出不满足某段时间内休息日天数告警
void MinODPInPeriodForCcRule::ThrowRuleViolationForDaysFreeOfDuty() const {
	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("startTimeUtc"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("endTimeUtc"), 0);
	time_t offsetTZMinute = StringUtils::stoi(_ruleViolation.GetParam("offsetTZMinute"), 0);

	char startUtcStr[30] = { 0 };
	char endUtcStr[30] = { 0 };
	Utility::GetInstancePtr()->UTCToUTCStr(startUtc + offsetTZMinute * 60, startUtcStr, sizeof(startUtcStr));
	Utility::GetInstancePtr()->UTCToUTCStr(endUtc - 1 + offsetTZMinute * 60, endUtcStr, sizeof(endUtcStr));

	string minDaysFreeOfDuty = _ruleViolation.GetParam("minDaysFreeOfDuty");
	string maxRosterPeriod = _ruleViolation.GetParam("maxRosterPeriod");
	string maxDaysFreeOfDuty = _ruleViolation.GetParam("maxDaysFreeOfDuty");

	string msg = "In this {0:maxRosterPeriod} day roster period, at least {1:minDaysFreeOfDuty} Required Days Off (RDO) are needed, but the current number of RDOs ({2:maxDaysFreeOfDuty}) is deficient.";
	msg = StringUtils::Format(msg, maxRosterPeriod, minDaysFreeOfDuty, maxDaysFreeOfDuty);
	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;;
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	//OP#1448提供message参数给gantt
	rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
	rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
	rv->operation_result.insert(pair<string, string>("maxDaysFreeOfDuty", maxDaysFreeOfDuty));
	rv->operation_result.insert(pair<string, string>("minDaysFreeOfDuty", minDaysFreeOfDuty));
	rv->operation_result.insert(pair<string, string>("period", maxRosterPeriod));
	rv->operation_result.insert(pair<string, string>("period_type", "CD"));//日历日
	_ruleViolation.AddRuleViolations(rv);
}

void MinODPInPeriodForCcRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule: input.dbRules) {
		_ruleParams.emplace_back(MinODPInPeriodForCcRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString: input.ruleParamString) {
        _ruleParams.emplace_back(MinODPInPeriodForCcRuleParam(this));
        auto& newParam = _ruleParams.back();
        newParam.ParseParam(singleRuleParamString);
    }
}

